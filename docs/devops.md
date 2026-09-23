# DevOps Guide

This document is the operational reference for environment setup, deployment,
runtime dependencies, infrastructure locations, and common maintenance tasks
for SexyVoice.ai.

For local development onboarding, see [`README.md`](../README.md).
For architecture and product context, see [`ARCHITECTURE.md`](../ARCHITECTURE.md).

## Monorepo Layout

- `apps/web` contains the Next.js app package, `@sexyvoice/web`.
- `apps/docs` contains the Fumadocs docs site for `docs.sexyvoice.ai`.
- `scripts` contains operational one-off scripts as `@sexyvoice/scripts`.
- Root package scripts run through Turborepo.

## Infrastructure Overview

### Primary Services

- **Frontend / Hosting**: Vercel
- **Database / Auth**: Supabase
- **Audio Storage**: Cloudflare R2
- **Cache / Rate Limiting**: Upstash Redis
- **Monitoring**: Sentry
- **Analytics**: PostHog
- **Structured Logs**: Axiom
- **Payments**: Stripe
- **Voice Generation**:
  - Replicate
  - Google Generative AI
  - fal.ai
  - xAI
- **Realtime Calls**: LiveKit
- **Config Distribution**: Vercel Edge Config

## Runtime / Region Notes

### Production server locations

- **Supabase**: `eu-west-3`
- **Redis Upstash**: `us-west-2` (Oregon)
- **LiveKit Python server on Fly.io**: Paris CDG

### Storage

#### R2 buckets

- `sv-audio-files`
  - Eastern North America (ENAM)
  - Used for cloned and generated dashboard audio files

- `sv-api-speech-audio-files`
  - Eastern North America (ENAM)
  - Used for external API `/api/v1/speech` generated audio files

### Vercel regions

Current known regions for this project:

- `eu-west-3` - `cdg1`
- `us-east-1` - `iad1`
- `us-west-1` - `sfo1`

#### How to verify with Vercel CLI

These commands were tested with Vercel CLI `50.37.1`.

Confirmed working commands:

```bash
vercel --version
vercel project inspect sexyvoice
vercel env ls
```

Recommended verification flow:

1. Confirm the CLI is available:
   ```bash
   vercel --version
   ```
2. Inspect the linked project and confirm the project identity:
   ```bash
   vercel project inspect sexyvoice
   ```
3. Inspect configured environment variables for the linked project:
   ```bash
   vercel env ls
   ```

Notes:

- `vercel project inspect sexyvoice` currently returns general project metadata such as project ID, owner, root directory, framework preset, and Node.js version.
- `vercel env ls` confirms you are operating on `gianpaj-projects/sexyvoice`.
- The tested CLI output did not expose the runtime region list directly.
- For the final source of truth on active regions, verify the project in the Vercel dashboard if the CLI output is insufficient.

## Environment Setup

### Local development

1. Copy the example environment file:

   ```bash
   cp apps/web/.env.example apps/web/.env.local
   ```

2. Fill in all required values for the services you use.
3. Install dependencies:

   ```bash
   pnpm install
   ```

4. Start development:

   ```bash
   pnpm dev
   ```

### Preview / production deployments

- Configure environment variables in Vercel project settings.
- Keep production secrets out of local files and version control.
- Rotate secrets carefully and validate affected flows after rotation.
- If you add, rename, or remove an environment variable, update:
  - `AGENTS.md`
  - `README.md`
  - `apps/web/.env.example`
  - this file (`docs/devops.md`) when the change affects deployment,
    operations, security, or runtime setup

## Environment Variables

Use [`apps/web/.env.example`](../apps/web/.env.example) as the canonical
template.

### Core application

- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` - Safe for browser clients; database
  access remains controlled by RLS.
- `SUPABASE_SECRET_KEY` - Server-only key that bypasses RLS; never expose it to
  clients or place it in an environment variable with a `NEXT_PUBLIC_` prefix.

### Redis / caching

- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`

Used for:

- caching
- rate limiting
- fast lookups
- evicting dashboard audio URL cache entries after R2 cleanup deletion

### Cloudflare R2

- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_NAME`
- `R2_SPEECH_API_BUCKET_NAME`
- `R2_SPEECH_API_PUBLIC_URL`
- `R2_ENDPOINT`

Used for:

- dashboard audio storage
- external API speech output storage

### AI provider credentials

- `FAL_KEY`
- `GOOGLE_GENERATIVE_AI_API_KEY`
- `MISTRAL_API_KEY`
- `REPLICATE_API_TOKEN`
- `XAI_API_KEY` if xAI TTS is enabled in the environment
- `XAI_SUMMARY_MODEL` optional override for the Grok model used to analyze call
  transcripts (default `grok-4.3`)

Notes:

- `GOOGLE_GENERATIVE_AI_API_KEY` is the Gemini key.
  for free-user Gemini flows where configured in code.
- `MISTRAL_API_KEY` is required for voice cloning requests that use the
  Voxtral/Mistral path in `apps/web/app/api/clone-voice/route.ts`.
- `XAI_API_KEY` also powers call transcript analysis
  (`apps/web/lib/ai/analyze-call.ts`), not just Grok TTS.

### LiveKit real-time calls

- `LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`

Notes:

- `LIVEKIT_URL` is the websocket/server URL returned by `/api/call-token`
  and used by the frontend to connect to LiveKit rooms.
- `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` are server-only credentials used
  by `apps/web/app/api/call-token/route.ts` to mint LiveKit access tokens.
- These secrets must never be exposed to the client.

### Authentication / auth monitoring

- `API_KEY_HMAC_SECRET`
- `OAUTH_CALLBACK_MARKER_SECRET`
- `CALL_SUMMARY_SECRET`

Notes:

- `API_KEY_HMAC_SECRET` is used for HMAC hashing of external API keys.
- `OAUTH_CALLBACK_MARKER_SECRET` is the preferred dedicated secret for signing
  and verifying the short-lived OAuth callback marker cookie.
- If `OAUTH_CALLBACK_MARKER_SECRET` is unset, code may fall back to
  `API_KEY_HMAC_SECRET`, but a dedicated secret is recommended.
- `CALL_SUMMARY_SECRET` authenticates the Supabase Database Webhook that
  triggers `/api/call-sessions/analyze` on call completion. The same value must
  be stored in Supabase Vault as `call_summary_secret` (alongside
  `app_base_url`) so the `pg_net` trigger can call back into this app.

Generate secure secrets with:

```bash
openssl rand -hex 32
```

### Stripe

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_TOPUP_STARTER_PRICE_ID`
- `STRIPE_TOPUP_STANDARD_PRICE_ID`
- `STRIPE_TOPUP_PRO_PRICE_ID`
- `STRIPE_SUBSCRIPTION_STARTER_PRICE_ID`
- `STRIPE_SUBSCRIPTION_STANDARD_PRICE_ID`
- `STRIPE_SUBSCRIPTION_PRO_PRICE_ID`
- `STRIPE_SUBSCRIPTION_FIRST_MONTH_COUPON_ID` - Optional Stripe coupon
  applied automatically for eligible first-time subscribers.
- `STRIPE_SUBSCRIPTION_FIRST_MONTH_DISCOUNT_PERCENT` - Optional first-month
  discount percentage used to display discounted subscription pricing when the
  coupon is configured.

### Edge Config

- `EDGE_CONFIG`

Used for:

- dynamic call instructions
- runtime-configurable behavior without redeploys

### Monitoring / analytics / support

- `SENTRY_AUTH_TOKEN`
- `SENTRY_ORG`
- `SENTRY_PROJECT`
- `AXIOM_TOKEN`
- `NEXT_PUBLIC_POSTHOG_KEY`
- `NEXT_PUBLIC_POSTHOG_HOST`
- `NEXT_PUBLIC_CRISP_WEBSITE_ID`

### Notifications / cron

- `TELEGRAM_WEBHOOK_URL`
- `CRON_SECRET`

### Promotion / banner configuration

- `NEXT_PUBLIC_PROMO_ENABLED` — enables promo campaign behavior: promo banners, bonus-credit pricing, and promo metadata; does not control announcement banners
- `NEXT_PUBLIC_ACTIVE_PROMO_BANNER` — active promo banner id from `apps/web/messages/*.json` and `apps/web/lib/banners/registry.ts`; only used when `NEXT_PUBLIC_PROMO_ENABLED=true`
- `NEXT_PUBLIC_ACTIVE_ANNOUNCEMENT_BANNER` — active announcement banner id from `apps/web/messages/*.json` and `apps/web/lib/banners/registry.ts`; works independently of `NEXT_PUBLIC_PROMO_ENABLED`
- `NEXT_PUBLIC_PROMO_ID`
- `NEXT_PUBLIC_PROMO_THEME`
- `NEXT_PUBLIC_PROMO_TRANSLATIONS`
- `NEXT_PUBLIC_PROMO_COUNTDOWN_END_DATE`
- `NEXT_PUBLIC_PROMO_BONUS_STARTER`
- `NEXT_PUBLIC_PROMO_BONUS_STANDARD`
- `NEXT_PUBLIC_PROMO_BONUS_PRO`

### Inngest

- `INNGEST_EVENT_KEY`
- `INNGEST_SIGNING_KEY`
- `INNGEST_BASE_URL`

## Deployment Notes

### Feature gates

Pages that are merged but not ready to ship are gated by constants in
`apps/web/lib/features.ts` rather than by an environment variable, so the state
is visible in code review and cannot drift between Vercel projects.

- `VOICE_CLONING_PAGE_ENABLED` — the public `/[lang]/voice-cloning` landing
  page. Currently `process.env.VERCEL_ENV !== 'production'`: reviewable on
  previews and locally, `404` in production, because the demo audio is still
  TTS-generated placeholder material rather than real cloned output.

Each gate must cover every entry point, otherwise a "hidden" page stays
reachable. For `VOICE_CLONING_PAGE_ENABLED` that is: the page itself
(`notFound()`), the landing page feature card and its grid column count, the
footer Features link, and the `app/sitemap.ts` glob — the sitemap discovers
pages from the filesystem, so a gated page is advertised to search engines
unless it is excluded there too.

To ship a gated page, set the constant to `true` and remove the gate in a
follow-up cleanup.

### Docs site (Fumadocs)

- The docs site is a Fumadocs (Next.js) app in `apps/docs`, deployed to
  `docs.sexyvoice.ai` as its own Vercel project (separate from the web app).
- Set the Vercel project Root Directory to `apps/docs`; the build runs
  `next build` (which regenerates the OpenAPI reference via
  `generate-openapi-docs`).
- `apps/docs/vercel.json` sets an `ignoreCommand` that skips the deploy when the
  latest commit message contains `skip deploy`, `skip ci`, or `skip docs`.
- Keep the `docs.sexyvoice.ai` custom domain and the Vercel GitHub App
  connected to the repository/branch used for docs deployments.

### Supabase

- Supabase powers auth and database access.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is safe for browser clients and remains
  subject to RLS.
- `SUPABASE_SECRET_KEY` is server-only and bypasses RLS. Never expose it to
  clients or place it in an environment variable with a `NEXT_PUBLIC_` prefix.
- Be careful with migrations and generated types.

#### Client retries and auth responses

Server and script clients use the Supabase SDK's default PostgREST retries:
GET, HEAD, and OPTIONS requests retry network failures and HTTP 503/520 up to
three times. HTTP 504 and default POST RPCs, including credit mutations, are not
retried. Backoff adds 1s/2s/4s unless the server supplies `Retry-After`; it does not
set an overall request deadline. Do not wrap all Supabase requests in another
retry layer.

Pages, server actions, dashboard APIs, browser identity lookups, and the proxy
use `getVerifiedClaims()` from `apps/web/lib/supabase/auth.ts` when they need
verified identity. The helper delegates to `auth.getClaims()` and returns `null`
on an SDK auth error or absent claims. Callers require `claims.sub` and retain
independent ownership, credit, and entitlement checks in the database.

With asymmetric signing keys, `getClaims()` normally verifies locally using
cached JWKS; symmetric keys require an Auth-server request. Local verification
does not check current session revocation or account status, so a token can pass
until its expiry. JWT email and metadata are token snapshots. User-editable
`user_metadata` is only suitable for display or analytics, not authorization.

Biome enforces this policy with `biome-plugins/use-verified-claims.grit` in the
web app's `app`, `components`, `hooks`, and `lib` directories. Direct
`client.auth.getUser(...)` calls are errors regardless of the client variable
name. Intentional lookups need `// biome-ignore lint/plugin/use-verified-claims:`
with a reason immediately above the line containing the call. This is a syntax
rule, not alias tracking; tests and SDK fixtures are outside its scope.

Six calls deliberately use `getUser()`:

- The credits page needs current email to find or create a Stripe customer.
- The profile page supplies current email for password verification.
- Proxy restoration fetches Auth `created_at` only when the profile is missing
  and an email is present. Existing profiles need no extra Auth lookup there.
- Account deletion performs a fresh Auth lookup before account-wide cleanup.
- `POST /api/api-keys` and `POST /api/cli-login-sessions` perform fresh Auth
  lookups before issuing durable credentials.

The last three calls are sensitive-operation policy choices, not claims API
limitations. `getUser()` is not recent reauthentication or a complete session
revocation check. Immediate revocation enforcement or recent-login requirements
need explicit checks. External API v1 continues to authenticate API keys rather
than browser JWT claims.

The middleware profile check in `ensureUserApplicationState` disables retries
because it is a best-effort repair check on every dashboard request. A failed
read is reported and dashboard rendering continues without retry backoff. This
does not impose a deadline on the initial request or the restoration RPC.
Auth user lookup failures during restoration, including a missing user after
successful claim verification, are reported to Sentry with
`flow: inactive-user-reactivation`. Restoration is best-effort and does not
redirect a claims-authenticated dashboard request on lookup or repair failure.

The browser client disables SDK database retries. TanStack Query owns retries
for dashboard queries; direct browser reads retain single-attempt behavior.

`apps/web/lib/supabase/middleware-client.ts` writes refreshed cookies to the
request and response, preserving locale rewrites and request-header overrides.
Auth redirects retain cookies and the SSR cache headers. The OAuth callback
passes a response `Headers` collection to `createClient` and forwards it on both
success and failure redirects. Server components use the cookie-store adapter;
session refresh before rendering belongs in middleware.

The web app and operational scripts share the catalog version. The Telegram
bot's Deno URL import is versioned independently from the pnpm lockfile.

### Edge Config

If used, create an Edge Config and provide the `call-instructions` payload.

Example structure:

```json
{
  "call-instructions": {
    "defaultInstructions": "You are a ...",
    "initialInstruction": "SYSTEM: Say hi to the user in a seductive and flirtatious manner",
    "presetInstructions": {
      "soft-amanda": "You are a ...",
      "hard-brandi": "You are a ..."
    }
  }
}
```

## Operational Security Guidelines

- Never expose server-only secrets to the client.
- Prefer dedicated secrets over shared secrets when the purpose differs.
- Rotate secrets carefully and document the blast radius before doing so.
- Validate auth, payments, storage uploads, and API key flows after secret
  changes.
- Keep OAuth callback marker signing isolated from API key hashing where
  possible.
- Use production-only secure cookies where supported.

## Common Operational Tasks

### Start the app locally

```bash
pnpm install
pnpm dev
pnpm build
pnpm preview
```

### Validate code quality

`.lintstagedrc.js` is the pre-commit configuration. `pnpm lint-staged` formats
staged Markdown with the pinned Prettier dependency and supported code files with
Ultracite. TypeScript files are formatted before the project-wide type check runs.
Files excluded by Biome remain excluded from formatting.

For repository Markdown-only changes, format explicit paths instead of scanning
the workspace:

```bash
pnpm exec prettier --write AGENTS.md docs/devops.md
git diff --check
```

See [Task Completion Requirements](../AGENTS.md#task-completion-requirements) for
validation scope. For full code-quality checks:

```bash
pnpm run fixall
pnpm run type-check
pnpm run lint
pnpm run format
```

### Run tests

`pnpm test` runs all package test suites. The unit-test workflow in
`.github/workflows/tests.yml` uses `pnpm test:affected` to select changed
packages and their dependents through Turbo. To inspect that selection without
running tests, use `pnpm test:affected --dry=json`.

The `claude-review` job in `.github/workflows/claude.yml` resolves the current
PR head at job start and checks out that SHA with full history. Its prompt
requires Claude to verify and restore that checkout after action setup, then
review the entire PR diff at the pinned commit. Pushes do not trigger another
review; comment `@claude review` to request one.

After reviewing, Claude finds the unit-test run for the pinned SHA with
`gh run list` and waits with `gh run watch --interval 15 --exit-status`.
Discovery and waiting share a five-minute budget. The review reports the CI
conclusion and run URL, or explicitly reports unavailable or pending results.
This is an agent instruction, not a workflow dependency or guaranteed CI gate.

Both Claude jobs allow read-only `gh pr view`, `gh run list`, `gh run view`, and
`gh run watch` commands to inspect CI. Their GitHub App tokens request
`actions: read` and `checks: read` separately from the job-level permissions.

```bash
pnpm test
pnpm test:watch
pnpm test:coverage
pnpm test:ui
```

### Build content and validate translations

```bash
pnpm build:content
pnpm check-translations
```

### Generate Supabase types

```bash
pnpm run generate-supabase-types
```

## Sentry

### Configuration

- **Org**: `sexyvoiceai`
- **Project**: `sexyvoice-ai`
- Sentry is configured in `next.config.js` via `@sentry/nextjs`
- Client errors are tunneled through `/monitoring` to bypass ad-blockers
- Source maps are uploaded only in production (`VERCEL_ENV=production`)

### CLI setup

`sentry-cli` authenticates via `~/.sentryclirc` (contains an auth token).
Verify with:

```bash
sentry-cli info
```

### Common commands

List issues:

```bash
sentry-cli issues --org sexyvoiceai --project sexyvoice-ai list
```

Filter by status:

```bash
sentry-cli issues --org sexyvoiceai --project sexyvoice-ai -s unresolved list
```

Bulk resolve/mute:

```bash
sentry-cli issues --org sexyvoiceai --project sexyvoice-ai -i <ISSUE_ID> resolve
sentry-cli issues --org sexyvoiceai --project sexyvoice-ai -i <ISSUE_ID> mute
```

### Fetching event details via the API

`sentry-cli` does not support listing individual events. Use the Sentry REST
API directly with the auth token from `~/.sentryclirc`:

```bash
TOKEN=$(grep token ~/.sentryclirc | cut -d= -f2)

# List events for an issue (use the numeric issue ID, not the short ID)
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://sentry.io/api/0/organizations/sexyvoiceai/issues/<ISSUE_ID>/events/?full=true&limit=100"
```

The response is a JSON array of event objects. Useful fields:

- `dateCreated` — event timestamp
- `tags` — array of `{key, value}` pairs (includes `url`, `browser`,
  `browser.name`, `os`, `os.name`, `device.family`, `transaction`)
- `contexts.device` — device family, model, brand
- `contexts.browser` — browser name and version
- `contexts.os` — OS name and version
- `entries` — array containing `breadcrumbs` (with navigation history),
  `exception` (stack traces), and `request` data
- `user` — user ID and IP (may be `null` depending on privacy settings)

To extract a summary table from all events, pipe the JSON through a script:

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://sentry.io/api/0/organizations/sexyvoiceai/issues/<ISSUE_ID>/events/?full=true&limit=100" \
  | python3 -c "
import json, sys
events = json.load(sys.stdin)
for e in events:
    tags = {t['key']: t['value'] for t in e.get('tags', [])}
    print(f\"{e['dateCreated']}  {tags.get('browser', '?')}  {tags.get('os', '?')}  {tags.get('device.family', '?')}  {tags.get('url', '?')}\")
"
```

### Finding the numeric issue ID

The Sentry UI uses short IDs like `SEXYVOICE-AI-6C`. The numeric ID is
visible in the URL when viewing the issue in the Sentry dashboard, or in the
output of `sentry-cli issues list` (first column).

## Fal billing cost lookup

`apps/web/lib/fal-billing.ts` looks up reference audio enhancement costs through
`fetchWithRetry` in `apps/web/lib/fetch-with-retry.ts`. It makes one immediate
request and up to three retries, waiting 1s, 2s, and 4s between attempts. Each
request has a fresh 5-second timeout. HTTP 408, 429, and 5xx responses, fetch
failures, and missing or invalid cost data trigger retries. Other HTTP errors,
including 400, 401, 403, and 404, fail immediately. A valid `Retry-After` header
on a retryable HTTP response overrides the scheduled delay; it accepts integer
seconds or an HTTP date. Missing or invalid headers use the 1s/2s/4s schedule.

The helper's `maxTotalDelayMs` defaults to 30,000 ms across all retry sleeps,
including fallback delays. If the next delay exceeds the remaining budget, the
helper throws the last error immediately rather than retrying before the server
allows it. Large values and far-future dates cannot extend that budget.

With the Fal defaults, request timeouts total at most 20 seconds and scheduled
sleeps total at most 30 seconds: a worst-case budget of 50 seconds, excluding
local response processing and event-loop scheduling. Without `Retry-After`, the
1s/2s/4s ladder gives a 27-second budget. This is not a caller deadline; other
callers must choose timeouts, retry counts, and sleep budgets that fit their
remaining invocation time.

Only the final failure emits a Sentry warning, `Failed to fetch Fal billing event cost`.
The helper returns `null`, and the clone route records its
estimated enhancement cost instead. Successful retries do not emit warnings.

## Troubleshooting Checklist

### OAuth callback/session issues

Check:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- `OAUTH_CALLBACK_MARKER_SECRET`
- redirect URL configuration in Supabase / OAuth provider
- Sentry events tagged for OAuth callback flow

### Crisp credit balance

`CreditsSection` sends the browser's `['credits', userId]` query result to
Crisp as `creditsLeft`. Speech generation invalidates credit queries after each
request settles, including split segments and retries. A call-token 402 also
invalidates them; call disconnect refreshes the authenticated user's balance.

Crisp displays a session snapshot, not a live database balance. For support
investigations, verify `public.credits.amount` for the user's ID. If Crisp stays
stale, check the browser's credit query and the claims/paid-status lookups that
precede `Crisp.session.setData`. The query's 60-second `staleTime` does not poll.

### LiveKit call issues

Check:

- `LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`
- that `/api/call-token` can mint tokens successfully
- that the LiveKit agent name and room dispatch configuration match the deployed agent setup

### External API issues

Check:

- `API_KEY_HMAC_SECRET`
- `R2_SPEECH_API_BUCKET_NAME`
- `R2_SPEECH_API_PUBLIC_URL`
- Axiom logs
- rate limiting / Redis connectivity

### Gemini / voice generation issues

Check:

- `GOOGLE_GENERATIVE_AI_API_KEY`
- provider quotas
- request logs
- R2 upload configuration

### Storage issues

Check:

- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_NAME`
- `R2_ENDPOINT`
- bucket CORS configuration if browser fetches are involved

## Documentation Maintenance Rules

When environment or deployment behavior changes:

1. Update [`apps/web/.env.example`](../apps/web/.env.example)
2. Update [`README.md`](../README.md)
3. Update [`AGENTS.md`](../AGENTS.md)
4. Update this file if the change affects:
   - deployment
   - infra
   - runtime behavior
   - secret management
   - region placement
   - operational troubleshooting

Keeping these docs synchronized prevents setup drift between development,
deployment, and operational troubleshooting.

## Daily stats troubleshooting

The production `/api/daily-stats` handler delivers a Telegram message. Use the
focused tests or read-only queries for verification. Contribution inputs bypass
the local activity cache; database failures abort the report instead of showing
zero usage. Reporting definitions and test commands are in the
[daily-stats README](../apps/web/app/api/daily-stats/README.md). For local timing
comparisons, use the development-only cache bypass and runner described in
[Local benchmarking](../apps/web/app/api/daily-stats/README.md#local-benchmarking).
The runner rejects responses that do not confirm the cache bypass.
