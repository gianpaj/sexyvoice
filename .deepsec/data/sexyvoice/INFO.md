# sexyvoice-2

Turborepo monorepo. Scan target is the repo root; the live web app is
`apps/web` (Next.js 16 App Router, React 19, TypeScript). Other apps
(`apps/docs` Mintlify, `scripts`) are mostly inert for security review.

## What this codebase does

SexyVoice.ai — AI text-to-speech and voice cloning SaaS. Users authenticate
via Supabase Auth (Google OAuth), buy credits through Stripe, then call
internal dashboard APIs (session-cookie auth) or the external API v1
(API-key auth) to generate/clone voice through Replicate, Google Gemini
TTS, xAI Grok TTS, fal.ai, and Mistral Voxtral. Audio is stored in
Cloudflare R2; rate limits + KV in Upstash Redis. Real-time voice calls
use LiveKit.

## Auth shape

Two distinct auth surfaces — confusing them is the highest-impact bug class.

- **Session (dashboard, server actions, `/api/*` non-v1):** `createClient()`
  from `apps/web/lib/supabase/server.ts` + `supabase.auth.getUser()`. Route
  protection is centralized in `apps/web/lib/supabase/middleware.ts`
  (`updateSession`); see `publicRoutes` allowlist. Anything reading user
  data from a session-scoped client relies on RLS.
- **External API v1 (`apps/web/app/api/v1/*`):** `validateApiKey()` from
  `apps/web/lib/api/auth.ts`. Keys are HMAC-SHA256 hashed with
  `API_KEY_HMAC_SECRET` and looked up via `createAdminClient()` (service
  role, RLS-bypassing). Must pair with `consumeRateLimit()` + `*Admin`
  query variants from `apps/web/lib/supabase/queries.ts`, and
  `updateApiKeyLastUsed()` in a `finally`.
- **Service-role admin client:** `createAdminClient()` in
  `apps/web/lib/supabase/admin.ts` bypasses RLS — must never be reachable
  from a code path driven by unauthenticated/untrusted input without a
  prior auth check.
- **Webhooks:** Stripe verifies `Stripe-Signature` against
  `STRIPE_WEBHOOK_SECRET` (`apps/web/app/api/stripe/webhook/route.ts`).
  Cron uses `CRON_SECRET` bearer (`apps/web/app/api/daily-stats/route.ts`).
- **LiveKit:** `apps/web/app/api/call-token/route.ts` mints `AccessToken`s
  server-side and resolves predefined character prompts via
  `resolveCharacterPrompt()` — predefined prompt text must never be sent
  to the client.

## Threat model

Highest impact: (1) bypassing API-key auth/rate limit on `/api/v1/*` to
mint free TTS or drain another user's credits; (2) leaking the service
role key or invoking `createAdminClient()` from a session-only route
without re-checking ownership (cross-tenant data access); (3) tampering
Stripe webhook payloads to grant credits; (4) exposing predefined LiveKit
character prompt text to the client; (5) credit/usage accounting races
that let generations complete without `reduceCredits()`.

## Project-specific patterns to flag

- `createAdminClient()` used inside a session-cookie route without a
  preceding `supabase.auth.getUser()` check, OR used to read/write rows
  not scoped to the authenticated `userId` (cross-tenant leak).
- `/api/v1/*` route missing any of: `validateApiKey`, `consumeRateLimit`,
  `*Admin` query variant, or `updateApiKeyLastUsed` in `finally`. Also
  flag dashboard helpers (`getCredits`, `reduceCredits`, `saveAudioFile`,
  `getVoiceIdByName` — non-Admin) used inside `/api/v1/*`.
- Stripe webhook constructing events without `stripe.webhooks.constructEvent`
  or skipping the `Stripe-Signature` header check; trusting `customer`/
  `metadata.userId` from the event without `getUserIdByStripeCustomerId`.
- LiveKit/character routes selecting or returning the `prompts.text`
  column for `is_public=true` characters, or any path where a predefined
  prompt body could be serialized to a client response.
- API key handling: storing/logging the raw `sk_live_...` token, comparing
  it without `hashApiKey()`, or any path that constructs a key hash with
  a fallback when `API_KEY_HMAC_SECRET` is unset (production must throw).
- Cron/internal endpoints (`/api/daily-stats`, `/api/inngest`) without a
  `CRON_SECRET` bearer check or Inngest signature verification.
- R2 uploads using `R2_BUCKET_NAME` from a `/api/v1/*` handler, or
  `R2_SPEECH_API_BUCKET_NAME` from a dashboard handler — buckets must
  not cross.

## Known false-positives

- `apps/web/lib/supabase/admin.ts` and `apps/web/lib/api/auth.ts`
  legitimately use service-role + raw SQL by design.
- `apps/web/app/api/health/route.ts`, `/api/popular-audios`, and
  `/api/v1/openapi` are intentionally public/unauthenticated.
- `apps/web/posts/`, `apps/docs/`, `scripts/`, and root files like
  `testwifi.py`, `thumbs-vote.html`, `*.prompt.yml`, `tls_reset_logs/`
  are content/dev artifacts, not part of the request path.
- `process.env.STRIPE_WEBHOOK_SECRET!` non-null assertion in the Stripe
  webhook is intentional (deployment-required env var).
- The webhook route returns `{ received: true }` even on processing
  errors by design, to prevent Stripe retry storms — Sentry captures
  the error.
