# Claude Assistant Guidelines for SexyVoice.ai

This file contains repository-specific guidelines and instructions for Claude when working on the SexyVoice.ai project.

## Project Overview

SexyVoice.ai is an AI voice generation platform built with Next.js, TypeScript, and Supabase. The platform enables users to generate AI voices, clone voices, and manage a library of generated audio content using a credit-based system.

### Key Technologies

- **Frontend**: Next.js 15 with App Router, React 19, TypeScript 5
- **Backend**: Supabase (authentication, database, SSR), Replicate (AI voice generation), fal.ai (voice cloning)
- **Database**: Supabase PostgreSQL
- **Storage**: Vercel Blob Storage for audio files
- **Caching**: Upstash Redis for audio URL caching
- **Styling**: Tailwind CSS 3.4, shadcn/ui components, Radix UI primitives
- **Content**: Contentlayer2 for MDX blog processing
- **Payments**: Stripe integration
- **Monitoring**: Sentry error tracking and PostHog analytics
- **AI Services**: Google Generative AI for text enhancement
- **Code Quality**: Biome for linting and formatting
- **Package Manager**: pnpm 9
- **Internationalization**: English, Spanish, and German support

## Architecture Overview

### Application Structure
This is a Next.js 15 App Router application with the following key architectural patterns:

- **Internationalization**: Route-based i18n with English (en), Spanish (es), and German (de) support using `[lang]` dynamic segments
- **Authentication**: Supabase Auth with SSR support, session management in middleware
- **Database**: Supabase PostgreSQL with type-safe operations
- **Content**: Contentlayer2 for MDX blog posts with locale support
- **Styling**: Tailwind CSS with shadcn/ui components and Radix UI primitives
- **Caching**: Upstash Redis for performance optimization

### Key Directory Structure
```
app/[lang]/                    # Internationalized routes
├── (auth)/                    # Auth-related pages (login, sign up, etc.)
├── (dashboard)/               # Protected dashboard routes
│   └── dashboard/             # Main dashboard with nested routes
├── blog/[slug]/               # Dynamic blog post pages
└── page.tsx                   # Landing page

lib/
├── supabase/                  # Database client, queries, types
├── i18n/                      # Internationalization config and dictionaries
└── stripe/                    # Payment processing

components/
├── ui/                        # shadcn/ui components
└── [feature-components]       # App-specific components
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
5. Generated audio is uploaded to Vercel Blob Storage
6. Blob URL is cached in Redis and stored in Supabase with metadata
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
├── [lang]/         # Internationalized routes (en/es)
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
- `pnpm type-check` - Run TypeScript type checking

### Testing
- `pnpm test` - Run unit tests (lib/utils.test.ts)
- `pnpm test:watch` - Run unit tests in watch mode

### Content & Data
- `pnpm build:content` - Build Contentlayer2 content (MDX blog posts)
- `pnpm dev:content` - Start Contentlayer2 in development mode
- `pnpm check-translations` - Validate i18n translation files

### Database (Supabase)
- `supabase db push` - Apply migrations to database
- `supabase gen types typescript --project-id PROJECT_ID > database.types.ts` - Generate TypeScript types from database schema
- Migration files located in `supabase/migrations/` with timestamp format
- Telegram bot function available in `supabase/functions/telegram-bot/` using Deno and deployed on Deno Deploy

### Additional Commands
- `pnpm run analyze` - Analyze bundle size with ANALYZE=true
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
- Support multiple languages (EN/ES/DE with more planned)
- Implement audio preview functionality

### Content Moderation
- Implement voice privacy controls (public/private)
- Validate audio content before storage

## Testing Requirements

### Testing Guidelines
- Write unit tests for utility functions (`lib/utils.test.ts`)
- Plan to implement Playwright for E2E testing
- Plan to test critical user flows (authentication, voice generation, credit management)

## Content Management

### Internationalization
- Add translations to `lib/i18n/dictionaries/`
- Currently supports English (`en.json`), Spanish (`es.json`), German (`de.json`)
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
- **Storage**: `BLOB_READ_WRITE_TOKEN` (Vercel Blob Storage)
- **Caching**: `KV_REST_API_URL`, `KV_REST_API_TOKEN` (Upstash Redis)
- **AI Services**: `REPLICATE_API_TOKEN`, `FAL_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`
- **Payments**: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY`, plus pricing IDs for top-ups
- **Notifications**: `TELEGRAM_WEBHOOK_URL`, `CRON_SECRET`
- **Analytics**: PostHog (`NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`), Crisp chat
- **Monitoring**: Sentry (`SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`)
- **Production**: Environment-specific configurations for Sentry and CSP
- Follow `.env.example` for complete list and setup instructions

## Feature Development Priorities

Based on TODO.md, current priorities include:

1. **Data Management**: Account deletion with audio cleanup, branch merges (r2, terms-and-conditions)
2. **Voice Features**: Clone historical voices (Theodore Roosevelt, Queen Victoria, Winston Churchill), pre-cloned voices, PDF to audio conversion
3. **Internationalization**: Translate dashboard pages and SEO content to German, French; expand voice models to French, German, Korean, Mandarin
4. **User Experience**: Share pages for audio files, usage statistics, history page with regeneration
5. **Security**: Implement fakefilter for disposable email blocking, rate limiting, hCaptcha integration
6. **Analytics**: Add PostHog to auth pages, track paid user status, usage monitoring
7. **Testing**: Playwright E2E tests with test database, GitHub Actions CI/CD
8. **Documentation**: Knowledge base with Nextra, comparison pages with competitors

## Claude-Specific Instructions

### When Working on Issues

1. **Always analyze the project context first** by reading relevant files
2. **Follow the existing code patterns** and architectural decisions
3. **Run `pnpm run fixall` before committing** to ensure code quality
4. **Update documentation** when adding new features or changing APIs
5. **Consider internationalization** for user-facing text (currently EN/ES/DE, expanding to FR/IT/KO/PT/ZH)
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
pnpm run type-check              # Check TypeScript issues
pnpm run lint                    # Check code quality issues
pnpm run fixall                  # Fix all code quality issues
pnpm clean                       # Check for unused dependencies
supabase status                  # Check Supabase connection
pnpm run analyze                 # Analyze bundle size
```

---

This document should be updated as the project evolves and new patterns emerge.
