# Claude Assistant Guidelines for SexyVoice.ai

This file contains repository-specific guidelines and instructions for Claude when working on the SexyVoice.ai project.

## Project Overview

SexyVoice.ai is an AI voice generation platform built with Next.js, TypeScript, and Supabase. The platform enables users to generate AI voices, clone voices, and manage a library of generated audio content using a credit-based system.

### Key Technologies

- **Frontend**: Next.js 16 with App Router, React 19, TypeScript 5
- **Backend**: Supabase (authentication, database, SSR), Replicate (AI voice generation), fal.ai (voice cloning)
- **Database**: Supabase PostgreSQL
- **Storage**: Cloudflare R2 for audio files
- **Caching**: Upstash Redis for audio URL caching
- **Styling**: Tailwind CSS 3, shadcn/ui components, Radix UI primitives
- **Content**: Contentlayer2 for MDX blog processing
- **Payments**: Stripe integration with promotional bonus system
- **Monitoring**: Sentry error tracking and PostHog analytics
- **AI Services**: Google Generative AI for text enhancement
- **Code Quality**: Biome for linting and formatting
- **Testing**: Vitest for unit/integration tests, MSW for API mocking
- **Package Manager**: pnpm 10
- **Internationalization**: Website support for English, Spanish, German, Danish, Italian, and French; voice generation and cloning in 20+ languages

## Architecture Overview

### Application Structure
This is a Next.js 16 App Router application with the following key architectural patterns:

- **Internationalization**: Route-based i18n with English (en), Spanish (es), German (de), Danish (da), Italian (it), and French (fr) support using `[lang]` dynamic segments
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
├── actions/                   # Server actions (promos, stripe)
├── blog/[slug]/               # Dynamic blog post pages
└── page.tsx                   # Landing page

lib/
├── supabase/                  # Database client, queries, types
├── i18n/                      # Internationalization config and dictionaries
└── stripe/                    # Payment processing, pricing configuration

components/
├── ui/                        # shadcn/ui components
├── promo-banner.tsx           # Generic promotion banner
└── [feature-components]       # App-specific components

tests/
├── utils/                     # Test utilities and helpers
├── setup.ts                   # Vitest setup and mocks
└── *.test.ts                  # Test files
```

### Database Schema
Core tables:
- `profiles` - User profiles linked to Supabase Auth
- `voices` - Voice models (can be user-created or system voices)
- `audio_files` - Generated audio files with metadata
- `credits` - User credit balances
- `credit_transactions` - Credit usage/purchase history

### Voice Generation Flow
1. User selects voice and enters text in dashboard
2. API route validates request and checks user credits in Supabase
3. Request hash is looked up in Redis cache; if found, cached URL is returned
4. Otherwise, API invokes Replicate (voice generation) or fal.ai (voice cloning) to synthesize audio
5. Generated audio is uploaded to Cloudflare R2 Storage
6. R2 URL is cached in Redis and stored in Supabase with metadata
7. Analytics sent to PostHog, errors logged in Sentry
8. Final audio URL returned to client

## Development Guidelines

### Code Quality Standards

#### Essential Commands (Always run before committing)
```bash
pnpm run fixall      # Run all fixes: lint, format, and check
# OR run individually:
pnpm run lint --write    # Fix linting issues automatically
pnpm run format --write  # Format code with Biome
pnpm run typecheck      # Verify TypeScript types
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
- `pnpm lint` - Run Biome linting on app/, components/, hooks/, lib/, middleware.ts
- `pnpm lint:write` / `pnpm lint --write` - Auto-fix linting issues
- `pnpm format` - Format code with Biome
- `pnpm format:write` / `pnpm format --write` - Auto-format code
- `pnpm check:fix` - Run Biome check with fixes
- `pnpm fixall` - Run all code quality fixes (lint:write + format:write + check:fix)
- `pnpm typecheck` - Run TypeScript type checking

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
- **Authentication**: Supabase Auth with SSR support and middleware session management
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
- Add translations to `lib/i18n/dictionaries/`
- Currently supports English (`en.json`), Spanish (`es.json`), German (`de.json`), Danish (`da.json`), Italian (`it.json`), French (`fr.json`)
- Configured in `lib/i18n/i18n-config.ts` with `en` as default locale
- Uses route-based i18n with `[lang]` dynamic segments
- Middleware handles locale detection and routing
- Use `getDictionary()` for server components
- Run `pnpm run check-translations` before commits

### Content Guidelines
- Blog posts written in MDX in `posts/` directory
- Locale-specific posts use `.es.mdx` extension (defaults to English)
- Contentlayer2 processes content and generates type-safe data
- Follow SEO best practices for content structure

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
- **Storage**: `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_ENDPOINT` (Cloudflare R2)
- **Caching**: `KV_REST_API_URL`, `KV_REST_API_TOKEN` (Upstash Redis)
- **AI Services**: `REPLICATE_API_TOKEN`, `FAL_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`
- **Payments**: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY`, plus pricing IDs for top-ups and subscriptions
- **Promotions**: `NEXT_PUBLIC_PROMO_ENABLED`, `NEXT_PUBLIC_PROMO_ID`, `NEXT_PUBLIC_PROMO_BONUS_STARTER`, `NEXT_PUBLIC_PROMO_BONUS_STANDARD`, `NEXT_PUBLIC_PROMO_BONUS_PRO`
- **Notifications**: `TELEGRAM_WEBHOOK_URL`, `CRON_SECRET`
- **Analytics**: PostHog (`NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`), Crisp chat
- **Monitoring**: Sentry (`SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`)
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
3. **Internationalization**: Translate dashboard pages and SEO content to German, French, Italian, and Danish; expand voice models to French, German, Korean, Mandarin
4. **User Experience**: Share pages for audio files, usage statistics, history page with regeneration
5. **Security**: Implement fakefilter for disposable email blocking, rate limiting, hCaptcha integration
6. **Analytics**: Add PostHog to auth pages, track paid user status, usage monitoring
7. **Testing**: Expand test coverage, Playwright E2E tests with test database
8. **Documentation**: Knowledge base with Nextra, comparison pages with competitors

## Claude-Specific Instructions

### When Working on Issues

1. **Always analyze the project context first** by reading relevant files
2. **Follow the existing code patterns** and architectural decisions
3. **Run `pnpm run fixall` before committing** to ensure code quality
4. **Update documentation** when adding new features or changing APIs
5. **Consider internationalization** for user-facing text (currently EN/ES/DE/DA/IT/FR, expanding to KO/PT/ZH)
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

### Debug Commands
```bash
pnpm run typecheck              # Check TypeScript issues
pnpm run lint                    # Check code quality issues
pnpm run fixall                  # Fix all code quality issues
pnpm clean                       # Check for unused dependencies
supabase status                  # Check Supabase connection
pnpm run analyze                 # Analyze bundle size
```

## Rules

- Do not execute any `supabase` CLI commands or SQL queries that can write data

---

This document should be updated as the project evolves and new patterns emerge.
