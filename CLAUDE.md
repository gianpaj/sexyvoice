# Claude Assistant Guidelines for SexyVoice.ai

This file contains repository-specific guidelines and instructions for Claude when working on the SexyVoice.ai project.

## Project Overview

SexyVoice.ai is an AI voice generation platform built with Next.js, TypeScript, and Supabase. The platform enables users to generate AI voices, clone voices, and manage a library of generated audio content using a credit-based system.

### Key Technologies

- **Frontend**: Next.js 15 with App Router, React 19, TypeScript
- **Backend**: Supabase (authentication, database, SSR), Replicate (AI voice generation), fal.ai (voice cloning)
- **Database**: Supabase PostgreSQL with planned Drizzle ORM migration
- **Storage**: Cloudflare R2 for audio files
- **Caching**: Upstash Redis for audio URL caching
- **Styling**: Tailwind CSS, shadcn/ui components, Radix UI primitives
- **Payments**: Stripe integration for subscriptions
- **Monitoring**: Sentry error tracking and PostHog analytics
- **Internationalization**: English and Spanish support (with plans for Italian, French, German, Korean, Portuguese, and Mandarin)

## Architecture Overview

### Application Structure
This is a Next.js 15 App Router application with the following key architectural patterns:

- **Internationalization**: Route-based i18n with English (en) and Spanish (es) support using `[lang]` dynamic segments
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
5. Generated audio is uploaded to Cloudflare R2 Storage
6. R2 URL is cached in Redis and stored in Supabase with metadata
7. Analytics sent to PostHog, errors logged in Sentry
8. Final audio URL returned to client

## Development Guidelines

### Code Quality Standards

#### Essential Commands (Always run before committing)
```bash
pnpm run lint:fix    # Fix linting issues automatically
pnpm run format      # Format code with Biome
pnpm run type-check  # Verify TypeScript types
```

#### Code Style
- Use **Biome** for linting and formatting (configured in `biome.json`)
- Follow TypeScript strict mode conventions
- Use 2-space indentation, single quotes for strings
- Prefer `const` over `let`, use proper type annotations
- Use import/export types when appropriate
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
- `pnpm build` - Build production application
- `pnpm start` - Start production server
- `pnpm preview` - Build and start (preview production locally)

### Code Quality
- `pnpm lint` - Run Biome linting
- `pnpm lint:fix` - Auto-fix linting issues in app/, components/, hooks/, lib/, middleware.ts
- `pnpm format` - Format code with Biome
- `pnpm type-check` - Run TypeScript type checking

### Testing
- `pnpm test` - Run unit tests (lib/utils.test.ts)

### Content & Data
- `pnpm build:content` - Build Contentlayer2 content (MDX blog posts)
- `pnpm dev:content` - Start Contentlayer2 in development mode
- `pnpm check-translations` - Validate i18n translation files

### Database (Supabase)
- `supabase db push` - Apply migrations to database
- `supabase gen types typescript --project-id PROJECT_ID > database.types.ts` - Generate TypeScript types from database schema

### Additional Commands
- `pnpm run analyze` - Analyze bundle size

## Security and Privacy

### Security Requirements
- Implement rate limiting to prevent abuse
- Validate and sanitize all user inputs
- Use Content Security Policy (CSP) headers
- Follow voice cloning ethical guidelines (require permission)
- Implement proper authentication checks
- Block temporary email addresses for signups

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
- Support multiple languages (EN/ES/IT with more planned)
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
- Support English (`en.json`) and Spanish (`es.json`)
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
- **Storage**: `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ACCOUNT_ID`, `R2_BUCKET_NAME`, `R2_ENDPOINT` (Cloudflare R2)
- **Caching**: `KV_REST_API_URL`, `KV_REST_API_TOKEN` (Upstash Redis)
- **AI Services**: `REPLICATE_API_TOKEN`, `FAL_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`
- **Payments**: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_PRICING_ID`, plus top-up pricing IDs (`STRIPE_TOPUP_5_PRICE_ID`, `STRIPE_TOPUP_10_PRICE_ID`, `STRIPE_TOPUP_99_PRICE_ID`)
- **Notifications**: `TELEGRAM_WEBHOOK_URL`, `CRON_SECRET`
- **Analytics**: PostHog and Crisp configuration
- Follow `.env.example` for complete list and setup instructions

## Feature Development Priorities

Based on ROADMAP.md and TODO.md, current priorities include:

1. **Voice Features**: Voice cloning (✅ implemented with fal.ai), pre-cloned voices, long-form PDF conversion
2. **User Experience**: History page, regeneration functionality, sharing pages
3. **Security**: Email verification, rate limiting, Cloudflare protection
4. **Analytics**: Enhanced PostHog integration, user behavior tracking
5. **Testing**: Playwright E2E tests, GitHub Actions CI/CD
6. **Performance**: Bundle optimization, Redis caching (✅ implemented)
7. **Content Tools**: Video generation with seewav for waveform visualization

## Claude-Specific Instructions

### When Working on Issues

1. **Always analyze the project context first** by reading relevant files
2. **Follow the existing code patterns** and architectural decisions
3. **Run linting and type checking** before committing changes
4. **Update documentation** when adding new features or changing APIs
5. **Consider internationalization** for user-facing text
6. **Implement proper error handling** and loading states
7. **Follow security best practices** for voice-related features

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
supabase status                  # Check Supabase connection
pnpm run analyze                 # Analyze bundle size
```

---

This document should be updated as the project evolves and new patterns emerge.
