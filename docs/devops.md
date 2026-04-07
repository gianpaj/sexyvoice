# DevOps Guide

This document is the operational reference for environment setup, deployment,
runtime dependencies, infrastructure locations, and common maintenance tasks
for SexyVoice.ai.

For local development onboarding, see [`README.md`](../README.md).
For architecture and product context, see [`ARCHITECTURE.md`](../ARCHITECTURE.md).

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
   cp .env.example .env.local
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
  - `.env.example`
  - this file (`docs/devops.md`) when the change affects deployment,
    operations, security, or runtime setup

## Environment Variables

Use [`.env.example`](../.env.example) as the canonical template.

### Core application

- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

### Redis / caching

- `KV_URL`
- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`
- `KV_REST_API_READ_ONLY_TOKEN`

Used for:

- caching
- rate limiting
- fast lookups

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
- `GOOGLE_GENERATIVE_AI_API_KEY_SECONDARY`
- `GOOGLE_GENERATIVE_AI_API_KEY`
- `MISTRAL_API_KEY`
- `REPLICATE_API_TOKEN`
- `XAI_API_KEY` if xAI TTS is enabled in the environment

Notes:

- `GOOGLE_GENERATIVE_AI_API_KEY` is the primary Gemini key.
- `GOOGLE_GENERATIVE_AI_API_KEY_SECONDARY` can be used as the alternate key
  for free-user Gemini flows where configured in code.
- `MISTRAL_API_KEY` is required for voice cloning requests that use the
  Voxtral/Mistral path in `app/api/clone-voice/route.ts`.

### LiveKit real-time calls

- `LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`

Notes:
- `LIVEKIT_URL` is the websocket/server URL returned by `/api/call-token`
  and used by the frontend to connect to LiveKit rooms.
- `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` are server-only credentials used
  by `app/api/call-token/route.ts` to mint LiveKit access tokens.
- These secrets must never be exposed to the client.

### Authentication / auth monitoring

- `API_KEY_HMAC_SECRET`
- `OAUTH_CALLBACK_MARKER_SECRET`

Notes:
- `API_KEY_HMAC_SECRET` is used for HMAC hashing of external API keys.
- `OAUTH_CALLBACK_MARKER_SECRET` is the preferred dedicated secret for signing
  and verifying the short-lived OAuth callback marker cookie.
- If `OAUTH_CALLBACK_MARKER_SECRET` is unset, code may fall back to
  `API_KEY_HMAC_SECRET`, but a dedicated secret is recommended.

Generate secure secrets with:

```bash
openssl rand -hex 32
```

### Stripe

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PUBLISHABLE_KEY`
- `STRIPE_PRICING_ID`
- `STRIPE_TOPUP_5_PRICE_ID`
- `STRIPE_TOPUP_10_PRICE_ID`
- `STRIPE_TOPUP_99_PRICE_ID`
- `STRIPE_SUBSCRIPTION_5_PRICE_ID`
- `STRIPE_SUBSCRIPTION_10_PRICE_ID`
- `STRIPE_SUBSCRIPTION_99_PRICE_ID`

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
- `NEXT_PUBLIC_ACTIVE_PROMO_BANNER` — active promo banner id from `messages.promos.*` and `lib/banners/registry.ts`; only used when `NEXT_PUBLIC_PROMO_ENABLED=true`
- `NEXT_PUBLIC_ACTIVE_ANNOUNCEMENT_BANNER` — active announcement banner id from `messages.announcements.*` and `lib/banners/registry.ts`; works independently of `NEXT_PUBLIC_PROMO_ENABLED`
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

### Vercel

- Main app is deployed on Vercel.
- Preview deployments should receive the minimum required secrets for the flows
  being tested.
- Production secrets must be managed in project settings, never committed.

### Supabase

- Supabase powers auth and database access.
- `SUPABASE_SERVICE_ROLE_KEY` is privileged and must remain server-only.
- Be careful with migrations and generated types.

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

```bash
pnpm run fixall
pnpm run type-check
pnpm run lint
pnpm run format
```

### Run tests

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

## Troubleshooting Checklist

### OAuth callback/session issues

Check:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OAUTH_CALLBACK_MARKER_SECRET`
- redirect URL configuration in Supabase / OAuth provider
- Sentry events tagged for OAuth callback flow

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
- `GOOGLE_GENERATIVE_AI_API_KEY_SECONDARY`
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

1. Update [`.env.example`](../.env.example)
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
