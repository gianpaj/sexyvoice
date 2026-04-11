# Coding Assistant Guidelines

This is the repo-specific operating guide for SexyVoice.ai. Keep it short:
put durable agent rules here, and move product or architecture detail to linked
docs.

## Task Completion Requirements

- All of `pnpm fixall` and `pnpm type-check` must pass before considering tasks completed.

## Mandatory Rules

- Search: Always run `ck --help` first and use `ck` for codebase search.
  Prefer `ck --regex` for exact text, `ck --sem` or `ck --hybrid` for
  conceptual matches, and `--jsonl` for tooling.
- Read relevant files before changing code. Follow existing patterns and keep
  edits scoped.
- When writing or changing a test, run the test file or the smallest relevant
  suite. Run broader tests when the change affects shared behavior.
- When asked to work "step by step," keep working. Only pause when blocked or
  looping.
- Never execute `supabase` CLI commands or SQL queries that can write data.
  Read-only commands such as `supabase status` are allowed.
- Do not revert user changes unless the user explicitly asks.
- Run `pnpm fixall` before committing when feasible.

## Maintainability

Long term maintainability is a core priority. If you add new functionality, first check if there is shared logic that can be extracted to a separate module.
Duplicate logic across multiple files is a code smell and should be avoided. Don't be afraid to change existing code.
Don't take shortcuts by just adding local logic to solve a problem.

## Other Repos

- Docs: External API and Product docs - <https://github.com/gianpaj/sexyvoice-docs> - it should clone in same parent folder as this project.

## Project Snapshot

SexyVoice.ai is a Next.js 16, React 19, TypeScript, Supabase, and Tailwind 3
app for AI voice generation, voice cloning, audio tools, and LiveKit-powered AI
voice calls.

Core integrations: Supabase, Cloudflare R2, Upstash Redis, Replicate, fal.ai,
Google Generative AI, xAI Grok TTS, LiveKit, Stripe, Sentry, PostHog, Axiom,
Contentlayer2, and `next-intl`.

Package manager: `pnpm 10`.

## High-Value Paths

- `app/[lang]/` - localized App Router pages and layouts.
- `app/api/` - route handlers, including dashboard APIs and external API v1.
- `components/` - reusable UI and feature components.
- `hooks/` - client hooks, including LiveKit call state.
- `lib/api/` - external API v1 auth, schemas, rate limits, errors, logging,
  pricing, and OpenAPI generation.
- `lib/i18n/` and `messages/*.json` - locale config, navigation, and copy.
- `lib/supabase/` - Supabase clients, typed queries, and admin access.
- `lib/storage/` - Cloudflare R2 upload/delete helpers.
- `supabase/migrations/` - database migrations.
- `tests/` - Vitest tests and utilities.
- `docs/devops.md` - canonical environment, deployment, runtime, and
  troubleshooting docs.
- `tests/README.md` - testing details.
- `docs/changelog-format.md` - changelog rules.
- `.cursor/rules/` - database function and migration rules.

## Common Commands

```bash
pnpm dev                 # Start the dev server
pnpm build               # Production build
pnpm preview             # Build and run production locally
pnpm test                # Run all Vitest tests
pnpm test -- <file>      # Run a focused test file
pnpm type-check          # TypeScript checks
pnpm lint                # Biome lint check
pnpm format              # Biome format check
pnpm fixall              # lint:write + format:write + check:fix
pnpm check-translations  # Validate message key parity
pnpm build:content       # Build MDX content
pnpm clean               # Check unused dependencies with knip
```

## Code Style

- Use Biome formatting and linting from `biome.json`.
- Use 2-space indentation, single quotes, and the repo's import ordering.
- Keep TypeScript strict. Use `import type` and `export type` where appropriate.
- Follow React Server Component patterns in App Router code.
- Use kebab-case for files, PascalCase for components, lowercase hyphenated API
  route segments, and snake_case for database names.

## Internationalization

- UI copy must use `next-intl`; do not hardcode user-facing English strings.
- Supported website locales: `en`, `es`, `de`, `da`, `it`, `fr`.
- Server components use `getMessages()` from `next-intl/server`.
- Client components use `useTranslations()` from `next-intl`.
- Use locale-aware navigation exports from `lib/i18n/navigation.ts`, not raw
  Next.js navigation helpers.
- Add or update keys in every `messages/*.json` file and run
  `pnpm check-translations` for user-facing copy changes.

## Supabase and Database

- Use the SSR client from `lib/supabase/server.ts` for session-scoped server
  code.
- Use `createAdminClient()` only for server-side operations that require service
  role access, and never expose service role data to the client.
- Keep RLS in mind for all table access.
- Database functions should default to `SECURITY INVOKER`, set
  `search_path = ''`, and use fully qualified names.
- Migration files use `YYYYMMDDHHmmss_description.sql`.
- Enable RLS on new tables and add granular policies.

## External API v1

Routes under `app/api/v1/*` are API-key authenticated except
`/api/v1/openapi`.

- Validate keys with `validateApiKey()` from `lib/api/auth.ts`; never trust raw
  keys and always compare hashes.
- Rate-limit with `consumeRateLimit()` and return headers via
  `jsonWithRateLimitHeaders()`.
- Use `externalApiErrorResponse()` for structured errors.
- Use `*Admin` query variants from `lib/supabase/queries.ts`, because external
  API users are resolved from API keys, not session cookies.
- Call `updateApiKeyLastUsed()` in a `finally` block.
- Log outcomes through `createLogger()` from `lib/api/logger.ts`.
- Keep request and response schemas in `lib/api/schemas.ts`; they feed OpenAPI
  generation.
- When changing external API behavior, request/response schemas, auth, rate
  limits, errors, models, pricing, or OpenAPI output, update the
  `sexyvoice-docs` repo when available. If it is not available, document the
  exact public API changes in the final response so another coding agent with
  access can update it.
- External speech generation always generates fresh audio and uploads to the
  external API R2 bucket.

## Voice and Call Flows

- Dashboard TTS may use Redis URL caching; external API speech must not.
- Dashboard audio uses `R2_BUCKET_NAME`; external API audio uses
  `R2_SPEECH_API_BUCKET_NAME` and `R2_SPEECH_API_PUBLIC_URL`.
- Voice generation can involve Replicate, Google Gemini TTS, or xAI Grok TTS.
- Voice cloning uses fal.ai and must respect permission and privacy
  requirements.
- LiveKit call tokens resolve character prompts server-side. Predefined prompt
  text must never be exposed to the client.

## Banners

- Banner definitions live in `lib/banners/registry.ts`.
- Banner resolution lives in `lib/banners/resolve-banner.ts`.
- Dismissal actions live in `app/[lang]/actions/banners.ts`.
- Localized copy lives under `promos` or `announcements` in every
  `messages/*.json` file.
- Only one banner should be visible at a time.

## Documentation Rules

- Update docs when changing APIs, workflows, environment variables, or
  operational behavior.
- For environment variable changes, update `AGENTS.md`, `README.md`,
  `.env.example`, and `docs/devops.md` in the same change.
- Update `docs/devops.md` for deployment, infrastructure, runtime, secret, and
  troubleshooting changes.
- Follow `docs/changelog-format.md` for `Changelog.md`; treat changelog edits as
  release-only documentation work with no `Unreleased` section.
- Blog content lives in `posts/` and is processed by Contentlayer2.

## Security Notes

- Validate and sanitize API inputs.
- Preserve structured error handling and status codes.
- Protect service role secrets, API key hashes, payment data, and generated
  audio access.
- Respect voice rights and user privacy when working on cloning, public/private
  voices, retention, or moderation.

## Pull Requests

- Explain what changed and why.
- Mention tests and checks run.
- Note documentation updates.
- Call out impact on credits, billing, generation, storage, or API contracts
  when relevant.
