# Architecture Overview

This document outlines the high-level architecture of **SexyVoice.ai** and how data flows through the system.

> For detailed development guidelines, see [AGENTS.md](./AGENTS.md).
> For setup instructions and features, see [README.md](./README.md).

## Overview

SexyVoice.ai is a modern AI voice generation platform built with Next.js, TypeScript, and Supabase. The platform enables users to generate AI voices, clone voices, and manage a library of generated audio content using a credit-based system with support for 20+ languages.

## Key Components

- **Next.js App Router** – React framework with Server Components (RSCs), Suspense, and Server Actions
- **Supabase** – Authentication (OAuth with Google) and PostgreSQL database with SSR support
- **Replicate** – AI voice generation from text (pre-made voices and voice cloning)
- **fal.ai** – Alternative voice cloning service *(optional)*
- **Google Generative AI** – Text-to-speech, text enhancement, and automatic emotion tagging
- **Vercel Blob Storage** – Scalable storage for generated audio files and user-uploaded samples
- **Upstash Redis** – High-performance caching for audio URLs and request deduplication
- **Stripe** – Payment processing, credit top-ups, subscription management
- **Sentry** – Error tracking and performance monitoring
- **PostHog** – Product analytics and feature flags
- **Inngest** – Background job processing and scheduled tasks

## Voice Generation Flow

API endpoint: `POST /api/generate-voice`

```mermaid
flowchart TD
    A[User Input: Text + Voice] --> B[Authenticate User]
    B --> C[Check Credits]
    C --> D[Generate Cache Hash]
    D --> E{Check Redis Cache}
    E -->|Cache Hit| F[Return Cached Audio]
    E -->|Cache Miss| G[Generate Audio via AI Service]
    G --> H[Upload to Vercel Blob]
    H --> I[Cache URL in Redis]
    I --> J[Background: Deduct Credits]
    J --> K[Background: Save to Database]
    K --> L[Background: Send Analytics]
    L --> M[Return Audio URL]
```

### Steps

1. **Frontend Validation**: User enters text (max 500 chars) and selects a voice
2. **API Authentication**: Verify user session via Supabase Auth
3. **Credit Check**: Query user's credit balance in Supabase
4. **Credit Estimation**: Calculate required credits based on text length
5. **Cache Lookup**: Generate hash from (text + voice + parameters) and check Redis
6. **Cache Hit**: Return cached audio URL immediately (0 credits used)
7. **Cache Miss**:
   - Call appropriate AI service (Replicate or Google Generative AI)
   - Generate audio from text
8. **Storage**: Upload generated audio to Vercel Blob Storage
9. **Cache Update**: Store blob URL in Redis for future requests
10. **Background Tasks** (using Next.js `after()`):
    - Deduct credits from user balance
    - Save audio metadata to database
    - Send analytics event to PostHog
11. **Response**: Return audio URL, credits used, and remaining balance

## Voice Cloning Flow

API endpoint: `POST /api/clone-voice`

```mermaid
flowchart TD
    A[User Input: Text + Audio File + Locale] --> B[Authenticate User]
    B --> C[Validate Audio File]
    C --> D[Check Credits]
    D --> E{Check if Audio Uploaded}
    E -->|Exists| F[Use Existing Blob URL]
    E -->|New| G[Upload Audio to Blob]
    F --> H[Generate Cache Hash]
    G --> H
    H --> I{Check Redis Cache}
    I -->|Cache Hit| J[Return Cached Audio]
    I -->|Cache Miss| K[Select Model by Locale]
    K --> L[Generate Cloned Voice via Replicate]
    L --> M[Upload to Vercel Blob]
    M --> N[Cache URL in Redis]
    N --> O[Background: Deduct Credits]
    O --> P[Background: Save to Database]
    P --> Q[Background: Send Analytics]
    Q --> R[Background: Schedule Input Audio Cleanup]
    R --> S[Return Audio URL]
```

### Steps

1. **Frontend Validation**: User provides text (max 500 chars), uploads audio file, selects locale
2. **API Authentication**: Verify user session via Supabase Auth
3. **File Validation**:
   - Check MIME type (allowed: MP3, OGG, M4A, WAV)
   - Check file size (max 4.5MB)
   - Extract and validate audio duration (10 seconds to 5 minutes)
4. **Credit Check**: Query user's credit balance in Supabase
5. **Credit Estimation**: Calculate required credits (higher cost than regular generation)
6. **Audio Upload**:
   - Check if user's audio file already exists in Blob Storage
   - If not, upload to `clone-voice-input/{userId}-{sanitizedFilename}`
   - Use existing URL if already uploaded (based on filename)
7. **Cache Lookup**: Generate hash from (locale + text + audio blob URL) and check Redis
8. **Cache Hit**: Return cached cloned audio URL immediately (0 credits used)
9. **Cache Miss**:
   - Select model based on locale:
     - English (`en`): `resemble-ai/chatterbox`
     - Other languages: `resemble-ai/chatterbox-multilingual`
   - Call Replicate API with reference audio and text/prompt
   - Generate cloned voice audio
10. **Fetch & Storage**: Fetch generated audio from Replicate and upload to Vercel Blob as `clone-voice/{hash}.wav`
11. **Cache Update**: Store blob URL in Redis for future identical requests
12. **Background Tasks** (using Next.js `after()`):
    - Deduct credits from user balance
    - Save audio metadata to database (with voice_id for cloned voice)
    - Send analytics event to PostHog
    - Schedule cleanup of input audio file via Inngest (`clone-audio/cleanup.scheduled`)
13. **Response**: Return cloned audio URL, credits used, remaining balance, and input audio URL

### Voice Cloning Models

| Locale | Model | Provider |
|--------|-------|----------|
| English (`en`) | `resemble-ai/chatterbox` | Replicate |
| Other languages | `resemble-ai/chatterbox-multilingual` | Replicate |

### File Constraints

- **Allowed formats**: MP3, OGG, M4A, WAV
- **Max file size**: 4.5MB
- **Duration**: 10 seconds minimum, 5 minutes maximum
- **Storage**: Input audio temporarily stored, then cleaned up via background job

## Database Schema

### Core Tables

- `profiles` – User profiles linked to Supabase Auth users
- `voices` – Voice models (system voices and user-created cloned voices)
- `audio_files` – Generated audio files with metadata (text, URL, duration, credits used)
- `credits` – User credit balances
- `credit_transactions` – Credit usage and purchase history

See [AGENTS.md](./AGENTS.md) for detailed schema definitions.

## Caching Strategy

### Redis Cache Layer (Upstash)

- **Cache Key**: SHA-256 hash of request parameters (first 8 chars)
  - Voice Generation: `locale + text + voice + parameters`
  - Voice Cloning: `locale + text + audio_blob_url`
- **TTL**: Persistent (no expiration)
- **Cache Hit**: Returns audio URL immediately with 0 credit cost
- **Cache Miss**: Generates new audio, uploads to blob, stores URL in cache
- **Benefits**:
  - Reduces AI API costs for repeated requests
  - Improves response time for common queries
  - Enables identical request deduplication across users

## Application Structure

```
app/[lang]/                    # Internationalized routes (en, es, de)
├── (auth)/                    # Public authentication pages
├── (dashboard)/               # Protected dashboard routes
├── api/
│   ├── generate-voice/        # Voice generation endpoint
│   ├── clone-voice/           # Voice cloning endpoint
│   ├── webhooks/stripe/       # Stripe payment webhooks
│   └── cron/telegram/         # Daily stats notifications
├── actions/                   # Server actions (promos, stripe)
├── blog/[slug]/               # MDX blog posts
└── page.tsx                   # Landing page

lib/
├── supabase/                  # Database client, queries, types
├── i18n/                      # Internationalization (en, es, de)
├── stripe/                    # Payment processing
├── inngest/                   # Background jobs
└── utils/                     # Utility functions

components/
├── ui/                        # shadcn/ui components
└── [features]/                # Feature-specific components
```

See [AGENTS.md](./AGENTS.md) for detailed application structure and development guidelines.
