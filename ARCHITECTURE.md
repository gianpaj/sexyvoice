# Architecture Overview

This document outlines the high level architecture of **SexyVoice.ai** and how data flows through the system.

## Key Components

- **Next.js App Router** – renders the frontend and hosts API routes.
- **Supabase** – provides authentication and PostgreSQL database.
- **Replicate** – generates AI voice audio from text.
- **fal.ai** – handles voice cloning from custom audio samples.
- **Google Generative AI** – provides text-to-speech and text enhancement with emotion tags.
- **Vercel Blob Storage** – stores generated audio files.
- **Upstash Redis** – caches audio URLs for repeated requests.
- **Stripe** – processes payments and manages credit top-ups.
- **PostHog** – captures analytics events.
- **Sentry** – tracks errors and exceptions.

## Voice Generation Flow

```mermaid
flowchart TD
    user(User)
    client[Next.js Frontend]
    api[API Routes]
    supabase[Supabase auth & DB]
    redis[Upstash Redis]
    replicate[Replicate API]
    fal[fal.ai API]
    googleai[Google Generative AI]
    blob[Vercel Blob Storage]
    stripe[Stripe]
    posthog[PostHog]
    sentry[Sentry]

    user --> client
    client --> api
    api --> supabase
    api --> redis
    redis -->|Cache Hit| blob
    redis -->|Cache Miss| replicate
    redis -->|Cache Miss| fal
    api --> googleai
    replicate --> blob
    fal --> blob
    blob --> redis
    blob --> api
    api --> stripe
    api --> posthog
    api --> sentry
    api --> supabase
    blob --> client
```

1. The frontend calls API routes (e.g., `POST /api/generate-voice` or `POST /api/clone-voice`) with the text and voice parameters.
2. The API route validates the request and checks user credits in **Supabase**.
3. The request hash is looked up in **Redis**; if found, the cached URL is returned.
4. For cache misses, the route chooses the appropriate AI service:
   - **Replicate** for AI voice generation from text
   - **fal.ai** for voice cloning from custom audio samples
   - **Google Generative AI** for text enhancement and emotion tagging
5. Generated audio is uploaded to **Vercel Blob Storage**.
6. The blob URL is cached in **Redis** and stored in **Supabase** along with metadata.
7. Credit usage is tracked and **Stripe** handles any payment processing for top-ups.
8. Analytics are sent to **PostHog** and any errors are logged in **Sentry**.
9. The API returns the final audio URL to the client.
