# Claude Assistant Guidelines for SexyVoice.ai

- Search: Always run `ck --help` first and use `ck` for codebase search. Prefer `ck --regex` for exact text, `ck --sem`/`--hybrid` for conceptual matches, and `--jsonl` for tooling.

This file contains repository-specific guidelines and instructions for Claude when working on the SexyVoice.ai project.

## Rules

Whenever writing a test, run the test suite for that file or the entire suite.

## Project Overview

SexyVoice.ai is an AI voice generation platform built with Next.js, TypeScript, and Supabase. The platform enables users to generate AI voices, clone voices, and manage a library of generated audio content using a credit-based system.

### Key Technologies

- **Frontend**: Next.js 16 with App Router, React 19, TypeScript 5
- **Backend**: Supabase (authentication, database, SSR), Replicate (AI voice generation), fal.ai (voice cloning), xAI (Grok TTS)
- **Database**: Supabase PostgreSQL
- **Storage**: Cloudflare R2 for audio files (`R2_BUCKET_NAME` for dashboard, `R2_SPEECH_API_BUCKET_NAME` for external API)
- **Caching**: Upstash Redis for audio URL caching (dashboard/clone flows only; external API always generates fresh audio)
- **Real-time Communication**: LiveKit for AI voice calls with WebRTC
- **Styling**: Tailwind CSS 3, shadcn/ui components, Radix UI primitives
- **Content**: Contentlayer2 for MDX blog processing
- **Payments**: Stripe integration with promotional bonus system
- **Monitoring**: Sentry error tracking and PostHog analytics; Axiom for structured API request logging
- **AI Services**: Google Generative AI for text-to-speech (Gemini 2.5 Pro/Flash TTS) and text enhancement; xAI Grok TTS for multi-language voice generation
- **Configuration**: Vercel Edge Config for dynamic call instructions
- **External API**: REST API (`/api/v1/*`) with HMAC-keyed API keys, rate limiting, OpenAPI 3.1 spec
- **Code Quality**: Biome for linting and formatting
- **Testing**: Vitest for unit/integration tests, MSW for API mocking
- **Package Manager**: pnpm 10
- **Internationalization**: `next-intl` for route-based i18n; website UI in English, Spanish, German, Danish, Italian, and French; voice generation and cloning in 20+ languages

## Architecture Overview

### Application Structure

This is a Next.js 16 App Router application with the following key architectural patterns:

- **Internationalization**: `next-intl` with route-based i18n; English (en), Spanish (es), German (de), Danish (da), Italian (it), and French (fr) using `[lang]` dynamic segments; config in `lib/i18n/i18n-config.ts`; messages in `messages/*.json`; server components use `getMessages()` from `next-intl/server`, client components use `useTranslations()` from `next-intl`; navigation helpers (`Link`, `redirect`, `useRouter`, `usePathname`) exported from `lib/i18n/navigation.ts`; type-safe messages via `types/next-intl.d.ts`
- **Authentication**: Supabase Auth with SSR support, session management in middleware
- **Database**: Supabase PostgreSQL with type-safe operations
- **Content**: Contentlayer2 for MDX blog posts with locale support
- **Styling**: Tailwind 3 CSS with shadcn/ui components and Radix UI primitives
- **Caching**: Upstash Redis for performance optimization

### Key Directory Structure

```
app/[lang]/                    # Internationalized routes
├── (auth)/                    # Auth-related pages (login, sign up, etc.)
├── (dashboard)/               # Protected dashboard routes
│   └── dashboard/             # Main dashboard with nested routes
│       ├── call/              # Real-time AI voice call interface
│       ├── usage/             # Usage statistics dashboard
│       └── ...                # Other dashboard pages
├── tools/                     # Public utility tools
│   ├── audio-converter/       # Audio format conversion tool
│   └── transcribe/            # Audio transcription & translation tool
├── actions/                   # Server actions (promos, stripe)
├── blog/[slug]/               # Dynamic blog post pages
└── page.tsx                   # Landing page

app/api/
├── api-keys/                  # API key management (list, create)
│   └── [id]/                  # Deactivate a specific key (DELETE)
├── call-token/                # LiveKit token generation for calls (Zod validation, resolves character prompts from DB, includes character_id in metadata)
├── characters/                # Custom character CRUD (POST create/update, DELETE)
├── clone-voice/               # Voice cloning endpoint
├── daily-stats/               # Daily statistics
├── estimate-credits/          # Credit cost estimation
├── generate-text/             # Text enhancement with AI
├── generate-voice/            # Voice generation endpoint
├── health/                    # Health check
├── inngest/                   # Background jobs
├── popular-audios/            # Popular audio listing (not being used)
├── stripe/
│   ├── transactions/          # Stripe transaction history
│   └── webhook/               # Stripe payment webhooks
├── usage-events/              # Usage tracking API
├── v1/                        # External REST API (API-key auth, rate-limited)
│   ├── billing/               # GET  – credit balance + last transaction
│   ├── models/                # GET  – available model catalog
│   ├── openapi/               # GET  – OpenAPI 3.1 spec (public, no auth)
│   ├── speech/                # POST – text-to-speech generation
│   └── voices/                # GET  – list public TTS voices
└── wrapped/platform/          # Platform analytics (only updated once a year)

lib/
├── api/                       # External API shared layer
│   ├── auth.ts                # API key generation, HMAC hashing, validateApiKey()
│   ├── constants.ts           # EXTERNAL_API_MODELS catalog, RATE_LIMIT_DEFAULT
│   ├── errors.ts              # createApiError(), zodErrorToApiError()
│   ├── external-errors.ts     # Structured error definitions + externalApiErrorResponse()
│   ├── logger.ts              # Axiom-backed per-request structured logger
│   ├── model.ts               # resolveExternalModelId(), getDefaultFormat(), isFormatSupported(), getModelCatalogResponse()
│   ├── openapi.ts             # createExternalApiOpenApiDocument() via zod-openapi
│   ├── pricing.ts             # calculateExternalApiDollarAmount()
│   ├── rate-limit.ts          # consumeRateLimit() using Upstash Ratelimit
│   ├── responses.ts           # jsonWithRateLimitHeaders()
│   └── schemas.ts             # Zod schemas for all v1 request/response types
├── edge-config/               # Vercel Edge Config for dynamic settings
├── i18n/                      # Internationalization config and dictionaries
├── inngest/                   # Background job definitions (not being used)
├── redis/                     # Upstash Redis client and helpers
├── storage/                   # Cloudflare R2 upload/delete operations
│                              #   uploadFileToR2(filename, buffer, contentType, bucketName, publicBaseUrl)
├── stripe/                    # Payment processing, pricing configuration
├── supabase/                  # Database client, queries, types
│   ├── admin.ts               # createAdminClient() – service role, bypasses RLS
│   ├── queries.ts             # Shared DB queries; *Admin variants for external API routes
│   └── server.ts              # createClient() – anon key, session-scoped
├── ai.ts                      # Google Generative AI integration
├── banlist.ts                 # Blocked email domains
└── utils.ts                   # Shared utilities
```

data/
├── playground-state.ts        # Call session state management
├── presets.ts                 # Preset configurations for calls
├── voices.ts                  # Voice definitions
└── session-config.ts          # Session configuration

components/
├── ui/                        # shadcn/ui components
├── call/                      # Real-time call components (17 files)
├── promo-banner.tsx           # Generic promotion banner
└── [feature-components]       # App-specific components

hooks/
├── use-connection.tsx         # LiveKit connection management
├── use-agent.tsx              # AI agent interaction
├── use-call-timer.ts          # Call duration tracking
├── use-playground-state.tsx   # Call state management
└── ...                        # Other hooks

tests/
├── utils/                     # Test utilities and helpers
├── setup.ts                   # Vitest setup and mocks
└── *.test.ts                  # Test files
```

### Database Schema

Core tables:

- `profiles` - User profiles linked to Supabase Auth
- `voices` - Voice models (can be user-created or system voices); includes `feature` column (`feature_type` enum: `'tts'` or `'call'`), `description`, `type`, and `sort_order` for stable ordering
- `audio_files` - Generated audio files with metadata
- `credits` - User credit balances
- `credit_transactions` - Credit usage/purchase history
- `call_sessions` - Real-time voice call sessions with duration and billing
- `usage_events` - Detailed usage tracking for analytics and billing
- `characters` - AI character metadata (name, image, voice FK, session config, localized descriptions); supports both predefined (`is_public = true`) and user-created custom characters (max 10 per user)
- `prompts` - Prompt content for characters (English text + localized JSONB translations); linked 1:1 from `characters.prompt_id`; predefined prompt text is never exposed to the client
- `api_keys` - External API keys; stores `key_hash` (HMAC-SHA256, never the raw key), `key_prefix` (first 12 chars for display), `is_active`, `expires_at`, `permissions` (JSONB scopes), `last_used_at`

Shared enum types:

- `feature_type` — `'tts'` | `'call'` — used by both `voices.feature` and `prompts.type` to discriminate which product feature a voice or prompt belongs to

### Voice Generation Flow (Dashboard)

1. User selects voice and enters text in dashboard
2. API route validates request and checks user credits in Supabase
3. Request hash is looked up in Redis cache; if found, cached URL is returned
4. Otherwise, API invokes Replicate (voice generation) or Google Gemini TTS to synthesize audio
5. Generated audio is uploaded to Cloudflare R2 Storage (`R2_BUCKET_NAME`)
6. R2 URL is cached in Redis and stored in Supabase with metadata
7. Analytics sent to PostHog, errors logged in Sentry
8. Final audio URL returned to client

### External API Speech Generation Flow (`POST /api/v1/speech`)

1. Request arrives with `Authorization: Bearer sk_live_…` header
2. API key is HMAC-SHA256 hashed and looked up in `api_keys` table via admin client
3. Rate limit checked via Upstash Ratelimit (60 req/min per key hash)
4. Request body validated against `VoiceGenerationRequestSchema` (Zod)
5. Voice looked up by name in `voices` table (admin client, bypasses RLS)
6. Model compatibility, text length, and format validated
7. User credit balance fetched via admin client; 402 returned if insufficient
8. Audio generated fresh every time (no cache) — Gemini TTS for `gpro`, xAI TTS for `grok`, Replicate for `orpheus`
9. Audio uploaded to `R2_SPEECH_API_BUCKET_NAME` with public URL from `R2_SPEECH_API_PUBLIC_URL`
10. Credits deducted, audio file saved, usage event inserted — all via admin client
11. Response includes `url`, `credits_used`, `credits_remaining`, and `usage` object
12. Rate limit headers (`X-RateLimit-*`) and `request-id` included on every response

### Real-time AI Voice Call Flow

1. User selects a character (predefined or custom) and configures call settings in `/dashboard/call`
2. User clicks connect, frontend requests token from `/api/call-token` with `selectedPresetId` (character UUID)
3. API validates request using Zod schema, checks user session and minimum credit balance
4. API resolves the character's prompt from the DB via `resolveCharacterPrompt()` using `createAdminClient()` (bypasses RLS so predefined prompt text never reaches the client)
5. For custom characters, API verifies ownership and paid status before resolving the prompt
6. LiveKit access token is generated with room configuration, AI agent dispatch, and metadata including `character_id` for tracking
7. Client connects to LiveKit room using WebRTC
8. AI agent joins the room and handles real-time voice conversation with access to character metadata
9. Call duration and usage are tracked via `call_sessions` and `usage_events` tables
10. Credits are deducted based on call duration
11. On disconnect, credits are refetched and UI is updated

## Development Guidelines

### Code Quality Standards

#### Essential Commands (Always run before committing)

```bash
pnpm run fixall      # Run all fixes: lint, format, and check
# OR run individually:
pnpm run lint --write    # Fix linting issues automatically
pnpm run format --write  # Format code with Biome
pnpm run type-check      # Verify TypeScript types
```

#### Code Style

- Use **Biome** for linting and formatting (configured in `biome.json`)
- 2-space indentation, single quotes, 80 character line width
- Automatic import organization with Node, Package, Alias groups
- TypeScript strict mode with `strictNullChecks` enabled
- Use import/export types when appropriate
- Prefer `const` over `let`, use proper type annotations
- Follow React Server Components (RSC) patterns

### File Structure Conventions

#### Naming Conventions

- Components: PascalCase (e.g., `VoiceGenerator.tsx`)
- Files: kebab-case (e.g., `audio-player.tsx`)
- API routes: lowercase with hyphens
- Database tables: snake_case

#### Component Organization

```
components/
├── ui/              # shadcn/ui base components
├── *.tsx           # Reusable components (kebab-case naming)
```

#### App Router Structure

```
app/
├── [lang]/         # Internationalized routes (en/es/de/da/it/fr)
│   ├── (auth)/     # Authentication pages
│   ├── (dashboard)/ # Protected dashboard pages
│   └── layout.tsx  # Language-specific layout
├── api/            # API routes
└── globals.css     # Global styles
```

### Database and API Guidelines

#### Supabase Integration

- Use Supabase SSR client for server components
- Implement proper error handling for database operations
- Follow Row Level Security (RLS) policies
- Use typed database queries with proper TypeScript interfaces

#### Database Development Guidelines

When creating database functions, follow Cursor rules in `.cursor/rules/`:

- Default to `SECURITY INVOKER` for functions
- Always set `search_path = ''` and use fully qualified names
- Migration files use format: `YYYYMMDDHHmmss_description.sql`
- Enable RLS on all new tables with granular policies

#### API Route Standards

- Implement proper error handling and status codes
- Use Supabase service role for admin operations
- Validate input data and sanitize outputs
- Implement rate limiting for resource-intensive operations

#### External API Route Standards (`/api/v1/*`)

- All routes (except `/api/v1/openapi`) require `Authorization: Bearer sk_live_…` header
- Use `validateApiKey()` from `lib/api/auth.ts` — never trust raw key, always compare hashes
- Use `consumeRateLimit()` and return rate limit headers via `jsonWithRateLimitHeaders()`
- Use `externalApiErrorResponse()` for all error responses — consistent structured error shape
- Use `*Admin` query variants from `lib/supabase/queries.ts` (e.g. `getCreditsAdmin`, `getVoiceIdByNameAdmin`) — external API routes resolve `userId` from the API key, not a session cookie, so `createClient()` (anon key + RLS) will not see the data
- Always call `updateApiKeyLastUsed()` in a `finally` block
- Log every request outcome to Axiom via `createLogger()` from `lib/api/logger.ts`
- Schemas live in `lib/api/schemas.ts` and are shared with the OpenAPI document generator

### Authentication & Routing

- Middleware handles locale detection and Supabase session management
- Protected routes use `(dashboard)` route group
- Public routes include auth pages and static content

## Development Commands

### Core Commands

- `pnpm dev` - Start development server with Turbopack
- `pnpm build` - Build production application (includes content build and translation checks)
- `pnpm start` - Start production server
- `pnpm preview` - Build and start (preview production locally)

### Code Quality

- `pnpm lint` - Run Biome linting on app/, components/, hooks/, lib/, proxy.ts
- `pnpm lint:write` / `pnpm lint --write` - Auto-fix linting issues
- `pnpm format` - Format code with Biome
- `pnpm format:write` / `pnpm format --write` - Auto-format code
- `pnpm check:fix` - Run Biome check with fixes
- `pnpm fixall` - Run all code quality fixes (lint:write + format:write + check:fix)
- `pnpm type-check` - Run TypeScript type checking

### Testing

- `pnpm test` - Run all tests with Vitest
- `pnpm test:watch` - Run tests in watch mode
- `pnpm test:ui` - Run tests with UI interface
- `pnpm test:coverage` - Generate test coverage report

### Content & Data

- `pnpm build:content` - Build Contentlayer2 content (MDX blog posts)
- `pnpm dev:content` - Start Contentlayer2 in development mode
- `pnpm check-translations` - Validate i18n translation files

### Database (Supabase)

- `supabase db push` - Apply migrations to database
- `pnpm run generate-supabase-types` - Generate TypeScript types from database schema
- Migration files located in `supabase/migrations/` with timestamp format
- Telegram bot function available in `supabase/functions/telegram-bot/` using Deno and deployed on Deno Deploy

### Additional Commands

- `pnpm run analyze` - Analyze bundle size
- `pnpm clean` - Remove unused dependencies with knip
- `pnpm prepare` - Setup Husky git hooks

## Security and Privacy

### Security Requirements

- **Content Security Policy**: Comprehensive CSP headers configured in `next.config.js`
- **Security Headers**: X-Content-Type-Options set to `nosniff`
- **Authentication**: Supabase Auth with SSR support and middleware (proxy) session management
- **API Security**: Rate limiting and input validation on API routes
- **Voice Ethics**: Follow voice cloning ethical guidelines (require permission)
- **Email Security**: Block temporary email addresses for signups
- **Error Monitoring**: Sentry integration with production tunneling (Generates a random route for each build)

### Privacy Considerations

- Implement data retention policies
- Respect voice rights and permissions
- Secure audio file storage and access

## AI/ML Specific Guidelines

### Voice Generation

- Use Replicate API for AI voice generation
- Use fal.ai API for voice cloning functionality
- Use Google Generative AI for text-to-speech and text enhancement (emotion tags)
- Implement credit tracking for API usage
- Handle voice cloning with proper permissions
- Support voice generation and cloning in 20+ languages (including Arabic, Bengali, Dutch, English, French, German, Hindi, Indonesian, Italian, Japanese, Korean, Marathi, Polish, Portuguese, Romanian, Russian, Spanish, Tamil, Telugu, Thai, Turkish, Ukrainian, Vietnamese, and more)
- Implement audio preview functionality

### Content Moderation

- Implement voice privacy controls (public/private)
- Validate audio content before storage

### Testing Requirements

### Testing Guidelines

- **Framework**: Vitest with MSW for API mocking
- **Test Files**: Located in `tests/` directory with `*.test.ts` naming
- **Coverage**: Voice generation API, Stripe webhooks, utility functions
- **Mocking**: MSW handlers for external APIs (Replicate, Stripe, Supabase)
- **Setup**: Global test setup in `tests/setup.ts` with environment variable mocking
- **Utilities**: Reusable test helpers in `tests/utils/`
- **CI/CD**: GitHub Actions workflow for automated testing
- **E2E**: Plan to implement Playwright for end-to-end testing
- Test critical flows: voice generation, credit management, payment webhooks
- See `tests/README.md` for detailed testing documentation

## Content Management

### Internationalization

- Translations live in `messages/` — one JSON file per locale: `en.json`, `es.json`, `de.json`, `da.json`, `it.json`, `fr.json`
- i18n is powered by **`next-intl`** (replaces the old `getDictionary()` helper, which has been deleted)
- Locale config in `lib/i18n/i18n-config.ts` (`defaultLocale: 'en'`)
- Request config (locale resolution + message loading) in `src/i18n/request.ts`
- Type declarations in `types/next-intl.d.ts` — `IntlMessages` is globally augmented so all `useTranslations` / `getMessages` calls are fully type-safe
- **Server components**: `import { getMessages } from 'next-intl/server'` then `const messages = (await getMessages({ locale: lang })) as IntlMessages`
- **Client components**: `import { useTranslations } from 'next-intl'` then `const t = useTranslations('generate')`
- **Navigation**: use `Link`, `redirect`, `useRouter`, `usePathname` from `lib/i18n/navigation.ts` (wraps `next-intl/navigation`) instead of Next.js builtins so locale prefix is handled automatically
- Uses route-based i18n with `[lang]` dynamic segments; middleware handles locale detection and routing
- Run `pnpm run check-translations` before commits to validate all locale files have the same keys

### Content Guidelines

- Blog posts written in MDX in `posts/` directory
- Locale-specific posts use `.es.mdx` extension (defaults to English)
- Contentlayer2 processes content and generates type-safe data
- Follow SEO best practices for content structure

### Changelog Maintenance

- Keep changelog formatting rules in `docs/changelog-format.md`
- Treat `Changelog.md` updates as release-only documentation work:
  no `Unreleased` section, use the documented header/category format,
  and include only items supported by repo history

## Environment and Deployment

### Environment Setup

```bash
pnpm install        # Install dependencies
pnpm run dev        # Start development server
pnpm run build      # Build for production
pnpm run preview    # Preview production build
```

### Environment Variables

Key environment variables include:

- **Supabase**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- **Storage**: `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_ENDPOINT` (Cloudflare R2 — dashboard audio); `R2_SPEECH_API_BUCKET_NAME`, `R2_SPEECH_API_PUBLIC_URL` (separate bucket + public domain for external API audio)
- **Caching**: `KV_REST_API_URL`, `KV_REST_API_TOKEN` (Upstash Redis)
- **AI Services**: `REPLICATE_API_TOKEN`, `FAL_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `XAI_API_KEY` (xAI Grok TTS)
- **Real-time Calls**: `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_URL` (LiveKit for voice calls)
- **Edge Config**: `EDGE_CONFIG` (Vercel Edge Config for dynamic call instructions)
- **Payments**: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY`, plus pricing IDs for top-ups and subscriptions
- **Promotions**: `NEXT_PUBLIC_PROMO_ENABLED`, `NEXT_PUBLIC_PROMO_ID`, `NEXT_PUBLIC_PROMO_BONUS_STARTER`, `NEXT_PUBLIC_PROMO_BONUS_STANDARD`, `NEXT_PUBLIC_PROMO_BONUS_PRO`
- **Notifications**: `TELEGRAM_WEBHOOK_URL`, `CRON_SECRET`
- **Analytics**: PostHog (`NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`), Crisp chat
- **Monitoring**: Sentry (`SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`); Axiom (`AXIOM_TOKEN`) for structured API request logs
- **External API**: `API_KEY_HMAC_SECRET` (HMAC-SHA256 secret for hashing API keys — never expose, rotate carefully)
- **Production**: Environment-specific configurations for Sentry and CSP
- Follow `.env.example` for complete list and setup instructions

## Promotion System

### Generic Promotion Framework

The platform includes a flexible promotion system for credit bonuses:

- **Configuration**: Environment variables control promotion state and bonus amounts
- **Banner Component**: `promo-banner.tsx` displays dismissible promotion banners
- **Server Actions**: `app/[lang]/actions/promos.ts` handles banner dismissal with cookie tracking
- **Pricing Integration**: `lib/stripe/pricing.ts` calculates credit bonuses based on promotion status
- **Client-side State**: Cookie-based dismissal tracking (30-day expiry)

### Implementation Pattern

1. Enable promotion via `NEXT_PUBLIC_PROMO_ENABLED=true`
2. Set promotion ID (e.g., `halloween_2025`) and bonus amounts
3. Banner displays on landing and dashboard pages with CTA
4. Users can dismiss banner (stored in cookies)
5. Credit packages automatically include bonus credits when enabled

## Feature Development Priorities

Based on TODO.md, current priorities include:

1. **Data Management**: Account deletion with audio cleanup, branch merges (r2, terms-and-conditions)
2. **Voice Features**: Clone historical voices (Theodore Roosevelt, Queen Victoria, Winston Churchill), pre-cloned voices, PDF to audio conversion
3. **Internationalization**: Expand voice models to French, German, Korean, Mandarin; translate remaining SEO content
4. **User Experience**: Share pages for audio files, history page with regeneration
5. **Security**: Implement fakefilter for disposable email blocking, rate limiting, hCaptcha integration
6. **Analytics**: Add PostHog to auth pages, track paid user status
7. **Testing**: Expand test coverage, Playwright E2E tests with test database
8. **Documentation**: Knowledge base with Nextra, comparison pages with competitors

### Recently Completed Features

- **next-intl migration**: Replaced the bespoke `getDictionary()` / `lib/i18n/dictionaries/` system with `next-intl`; messages moved to `messages/*.json`; server components use `getMessages()`, client components use `useTranslations()`; fully type-safe via `types/next-intl.d.ts`
- **External REST API v1**: Public API (`/api/v1/*`) with API key auth (HMAC-SHA256), rate limiting, structured errors, OpenAPI 3.1 spec auto-generated from Zod schemas via `zod-openapi`
- **API Key Management**: Dashboard UI and `/api/api-keys` routes for creating/listing/deactivating keys; requires paid account; max 10 active keys per user
- **Real-time AI Voice Calls**: LiveKit-based voice calling with configurable AI agents
- **Usage Statistics Dashboard**: `/dashboard/usage` with detailed usage tracking and analytics
- **Audio Transcription & Translation**: `/tools/transcribe` page for offline audio transcription in 99+ languages with optional translation to English using Whisper AI

## Claude-Specific Instructions

### When Working on Issues

1. **Always analyze the project context first** by reading relevant files
2. **Follow the existing code patterns** and architectural decisions
3. **Run `pnpm run fixall` before committing** to ensure code quality
4. **Update documentation** when adding new features or changing APIs
5. **Consider internationalization** for user-facing text — add keys to `messages/en.json` (and all other locale files), use `getMessages()` in server components and `useTranslations()` in client components; never hardcode English strings in UI
6. **Implement proper error handling** and loading states
7. **Follow security best practices** for voice-related features
8. **Use TodoWrite tool** for multi-step tasks to track progress

### Pull Request Requirements

- Include clear description of changes and their purpose
- Reference related issues and feature requests
- Ensure all tests pass and code quality checks pass
- Update relevant documentation (README, ROADMAP, etc.)
- Consider impact on credit system and voice generation features

## Troubleshooting

### Common Issues

- **Build failures**: Check TypeScript errors and dependency conflicts
- **Database issues**: Verify Supabase connection and migration status
- **Audio generation**: Check Replicate API status and credit balance
- **Authentication**: Validate Supabase SSR configuration
- **External API 500s**: Check `R2_SPEECH_API_BUCKET_NAME` and `R2_SPEECH_API_PUBLIC_URL` are set; verify `API_KEY_HMAC_SECRET` matches what was used to hash stored keys; check Axiom logs for the full error via `createLogger()`
- **External API 403**: User account has no paid transaction — `hasUserPaidAdmin()` returned false; backfill or top up credits
- **External API credits showing 0**: User has no row in `credits` table (account predates the `handle_new_user` trigger); run the backfill SQL in `supabase/migrations/` comments or insert manually via Supabase dashboard
- **R2 CORS errors**: Configure CORS policy on the R2 bucket in the Cloudflare dashboard — allow `GET`/`HEAD` from your app origins

### Debug Commands

```bash

pnpm run type-check              # Check TypeScript issues
pnpm run lint                    # Check code quality issues
pnpm run fixall                  # Fix all code quality issues
pnpm clean                       # Check for unused dependencies
supabase status                  # Check Supabase connection
pnpm run analyze                 # Analyze bundle size
```

## Rules

- NEVER execute any `supabase` CLI commands or SQL queries that can write data

---

This document should be updated as the project evolves and new patterns emerge.
