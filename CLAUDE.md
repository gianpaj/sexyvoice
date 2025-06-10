# Claude Assistant Guidelines for SexyVoice.ai

This file contains repository-specific guidelines and instructions for Claude when working on the SexyVoice.ai project.

## Project Overview

SexyVoice.ai is an AI voice generation platform built with Next.js, TypeScript, and Supabase. The platform enables users to generate AI voices, clone a voice, and manage a library of generated audio content using a credit-based system.

### Key Technologies

- **Frontend**: Next.js 15 with App Router, React 19, TypeScript
- **Backend**: Supabase (authentication, database, SSR), Replicate (AI voice generation)
- **Database**: Supabase PostgreSQL with planned Drizzle ORM migration
- **Storage**: Vercel Blob Storage for audio files
- **Styling**: Tailwind CSS, shadcn/ui components, Radix UI primitives
- **Payments**: Stripe integration for subscriptions
- **Monitoring**: Sentry error tracking and PostHog analytics
- **Internationalization**: English and Spanish support

## Development Guidelines

### Code Quality Standards

#### Code Formatting and Linting

- **Always run these commands before committing**:

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

#### Component Organization

```t
components/
├── ui/              # shadcn/ui base components
├── *.tsx           # Reusable components (kebab-case naming)
```

#### App Router Structure

```t
app/
├── [lang]/         # Internationalized routes (en/es)
│   ├── (auth)/     # Authentication pages
│   ├── (dashboard)/ # Protected dashboard pages
│   └── layout.tsx  # Language-specific layout
├── api/            # API routes
└── globals.css     # Global styles
```

#### Key Naming Conventions

- Components: PascalCase (e.g., `VoiceGenerator.tsx`)
- Files: kebab-case (e.g., `audio-player.tsx`)
- API routes: lowercase with hyphens
- Database tables: snake_case

### Database and API Guidelines

#### Supabase Integration

- Use Supabase SSR client for server components
- Implement proper error handling for database operations
- Follow Row Level Security (RLS) policies
- Use typed database queries with proper TypeScript interfaces

#### API Route Standards

- Implement proper error handling and status codes
- Use Supabase service role for admin operations
- Validate input data and sanitize outputs
- Implement rate limiting for resource-intensive operations

### Testing Requirements

#### Test Commands

```bash
pnpm run test        # Run unit tests
```

#### Testing Guidelines

- Write unit tests for utility functions (`lib/utils.test.ts`)
- Plan to implement Playwright for E2E testing
- Plan to test critical user flows (authentication, voice generation, credit management)

### Security and Privacy

#### Security Requirements

- Implement rate limiting to prevent abuse
- Validate and sanitize all user inputs
- Use Content Security Policy (CSP) headers
- Follow voice cloning ethical guidelines (require permission)
- Implement proper authentication checks
- Block temporary email addresses for signups

#### Privacy Considerations

- Implement data retention policies
- Respect voice rights and permissions
- Secure audio file storage and access

### AI/ML Specific Guidelines

#### Voice Generation

- Use Replicate API for AI voice generation
- Implement credit tracking for API usage
- Handle voice cloning with proper permissions
- Support multiple languages (EN/ES with more planned)
- Implement audio preview functionality

#### Content Moderation

- Implement voice privacy controls (public/private)
- Validate audio content before storage

### Deployment and Environment

#### Environment Setup

```bash
pnpm install        # Install dependencies
pnpm run dev        # Start development server
pnpm run build      # Build for production
pnpm run preview    # Preview production build
```

#### Environment Variables

- Follow `.env.example` for required variables
- Use Vercel Environment Variables for production
- Configure Supabase connection strings
- Set up Stripe webhooks and API keys
- Configure Replicate API access

#### Database Operations

```bash
# Deploy migrations
supabase db push
# Generate Supabase DB types
supabase gen types typescript --project-id bfaqdyadcpaetelvpbva > database.types.ts
```

### Content Management

#### Internationalization

- Add translations to `lib/i18n/dictionaries/`
- Support English (`en.json`) and Spanish (`es.json`)
- Use `getDictionary()` for server components
- Plan for Italian, French, German, Korean, Portuguese and Mandarin

#### Content Guidelines

- Run `pnpm run check-translations` before commits
- Validate translation completeness
- Use ContentLayer for blog posts and documentation
- Follow SEO best practices for content structure

### Common Commands Reference

| Command               | Purpose                                 |
| --------------------- | --------------------------------------- |
| `pnpm run dev`        | Start development server with Turbopack |
| `pnpm run build`      | Build production bundle                 |
| `pnpm run lint:fix`   | Fix linting issues automatically        |
| `pnpm run type-check` | Verify TypeScript types                 |
| `pnpm run format`     | Format code with Biome                  |
| `pnpm run test`       | Run unit tests                          |
| `pnpm run clean`      | Remove unused dependencies with Knip    |
| `pnpm run analyse`    | Analyze bundle size                     |

### Feature Development Priorities

Based on ROADMAP.md and TODO.md, current priorities include:

1. **Voice Features**: Voice cloning, pre-cloned voices, long-form PDF conversion
2. **User Experience**: History page, regeneration functionality, sharing pages
3. **Security**: Email verification, rate limiting, Cloudflare protection
4. **Analytics**: Enhanced PostHog integration, user behavior tracking
5. **Testing**: Playwright E2E tests, GitHub Actions CI/CD
6. **Performance**: Bundle optimization, caching strategies

### Claude-Specific Instructions

#### When Working on Issues

1. **Always analyze the project context first** by reading relevant files
2. **Follow the existing code patterns** and architectural decisions
3. **Run linting and type checking** before committing changes
4. **Update documentation** when adding new features or changing APIs
5. **Consider internationalization** for user-facing text
6. **Implement proper error handling** and loading states
7. **Follow security best practices** for voice-related features

#### Pull Request Requirements

- Include clear description of changes and their purpose
- Reference related issues and feature requests
- Ensure all tests pass and code quality checks pass
- Update relevant documentation (README, ROADMAP, etc.)
- Consider impact on credit system and voice generation features

### Troubleshooting

#### Common Issues

- **Build failures**: Check TypeScript errors and dependency conflicts
- **Database issues**: Verify Supabase connection and migration status
- **Audio generation**: Check Replicate API status and credit balance
- **Authentication**: Validate Supabase SSR configuration

#### Debug Commands

```bash
pnpm run type-check              # Check TypeScript issues
pnpm run lint                    # Check code quality issues
supabase status                  # Check Supabase connection
```

This document should be updated as the project evolves and new patterns emerge.
