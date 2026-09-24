# Deployment and release checks

This guide covers deployment configuration, infrastructure, and verification
before merging to `main` and after deploying.

- [README](../README.md): local setup and development commands.
- [Architecture](../ARCHITECTURE.md): application behavior and service boundaries.
- [Scripts](../scripts/README.md): maintenance and incident investigations.

## Before merging

- Run the checks required by
  [Task Completion Requirements](../AGENTS.md#task-completion-requirements).
  Repository Markdown-only changes need formatting and `git diff --check`, not
  application builds or tests.
- Check CI for the current PR head, not an earlier commit. The unit-test workflow
  in `.github/workflows/tests.yml` runs `pnpm test:affected` for changed packages
  and their dependents. Inspect its selection with
  `pnpm test:affected --dry=json` when needed.
- For deployable changes, verify the affected app's build and exercise the changed
  flow on its preview deployment. Check authentication, billing, generation, and
  storage when the change touches those integrations. For call dashboard
  screenshots, follow the [fixture and local-server requirements](../apps/web/e2e/E2E_TEST_PLAN.md#current-mocking-behavior).
- Review pending migrations, generated database types, environment changes, and
  secret-rotation dependencies. Migrations require a human operator; agents must
  not apply them. Run `pnpm test:db` against a local database with pending
  migrations already applied when migrations or pgTAP tests change.
- Confirm feature gates and commit-message deployment skips are intentional.

Claude reviews pin a PR head and report CI results for that SHA. Pushes do not
request another Claude review; comment `@claude review` when one is needed.
The review's CI report is not a workflow dependency or a guaranteed merge gate.

## Deployment targets

| Service       | Deployment configuration                                                        |
| ------------- | ------------------------------------------------------------------------------- |
| Web app       | Vercel project `sexyvoice`, Root Directory `apps/web`                           |
| Docs site     | Separate Vercel project, Root Directory `apps/docs`, domain `docs.sexyvoice.ai` |
| LiveKit agent | External Python service on Fly.io, Paris CDG                                    |

Use Node.js `24.x` and the pnpm version pinned in `package.json`. Root build
commands use Turborepo. The docs app's build regenerates its OpenAPI reference;
keep its custom domain and Vercel GitHub App connected to the deployment branch.

The `ignoreCommand` in each app's `vercel.json` controls deployment skips:

- Web: `skip deploy` or `skip ci` in the latest commit message.
- Docs: `skip deploy`, `skip ci`, or `skip docs`.

The [documentation commit rule](../AGENTS.md#documentation-rules) defines when to
use `[skip deploy]`.

### Regions and storage

| Service                               | Configured location or purpose                        |
| ------------------------------------- | ----------------------------------------------------- |
| Supabase                              | `eu-west-3`                                           |
| Upstash Redis                         | `us-west-2`, Oregon                                   |
| `sv-audio-files` R2 bucket            | Eastern North America, dashboard TTS and cloned audio |
| `sv-api-speech-audio-files` R2 bucket | Eastern North America, external API speech            |

Known Vercel region identifiers are `cdg1`, `iad1`, and `sfo1`. Verify active
regions in the Vercel dashboard; project inspection may not list them.
From the linked project directory, confirm project identity and environment:

```bash
vercel project inspect sexyvoice
vercel env ls
```

## Environment variables

Use [`apps/web/.env.example`](../apps/web/.env.example) as the canonical template
and configure preview and production values in the appropriate Vercel project.
Keep production secrets out of local files and version control. Before rotating
a secret, identify every producer and consumer that must change together.

### Core application

- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: safe for browser clients; RLS controls
  database access.
- `SUPABASE_SECRET_KEY`: server-only and bypasses RLS. Never expose it through a
  `NEXT_PUBLIC_` variable.

### Redis and Cloudflare R2

- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_ENDPOINT`
- `R2_BUCKET_NAME`: dashboard audio.
- `R2_SPEECH_API_BUCKET_NAME`: external API audio.
- `R2_SPEECH_API_PUBLIC_URL`: public base URL for external API audio.

Keep dashboard and external API buckets separate. Verify bucket CORS for browser
playback and downloads.

### AI providers

- `FAL_KEY`
- `GOOGLE_GENERATIVE_AI_API_KEY`
- `MISTRAL_API_KEY`: required for the Voxtral cloning path.
- `REPLICATE_API_TOKEN`
- `XAI_API_KEY`: Grok TTS and call transcript analysis.
- `XAI_SUMMARY_MODEL`: optional call-analysis model override; default `grok-4.3`.

### LiveKit and call analysis

- `LIVEKIT_URL`: server URL returned by `/api/call-token`.
- `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`: server-only token-signing credentials.
- `CALL_SUMMARY_SECRET`: authenticates the call-analysis webhook. Store the same
  value in Supabase Vault as `call_summary_secret`, alongside `app_base_url`, so
  the `pg_net` trigger can call `/api/call-sessions/analyze`.

### Authentication

- `API_KEY_HMAC_SECRET`: hashes external API keys.
- `OAUTH_CALLBACK_MARKER_SECRET`: dedicated OAuth callback marker signing secret.
  The code can fall back to `API_KEY_HMAC_SECRET`, but separate secrets avoid
  coupling their rotation.

Generate secrets with `openssl rand -hex 32`. Verify Supabase and OAuth provider
redirect URLs for each deployment environment.

### Stripe

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_TOPUP_STARTER_PRICE_ID`
- `STRIPE_TOPUP_STANDARD_PRICE_ID`
- `STRIPE_TOPUP_PRO_PRICE_ID`
- `STRIPE_SUBSCRIPTION_STARTER_PRICE_ID`
- `STRIPE_SUBSCRIPTION_STANDARD_PRICE_ID`
- `STRIPE_SUBSCRIPTION_PRO_PRICE_ID`
- `STRIPE_SUBSCRIPTION_FIRST_MONTH_COUPON_ID`: optional coupon for eligible
  first-time subscribers.
- `STRIPE_SUBSCRIPTION_FIRST_MONTH_DISCOUNT_PERCENT`: displayed first-month
  discount when the coupon is configured.

### Edge Config

Set `EDGE_CONFIG` when using dynamic call instructions. The `call-instructions`
payload contains `defaultInstructions`, `initialInstruction`, and
`presetInstructions`. Keep private prompt contents server-side.

### Monitoring, analytics, and support

- `SENTRY_AUTH_TOKEN`
- `SENTRY_ORG`
- `SENTRY_PROJECT`
- `AXIOM_TOKEN`
- `NEXT_PUBLIC_POSTHOG_KEY`
- `NEXT_PUBLIC_POSTHOG_HOST`
- `NEXT_PUBLIC_CRISP_WEBSITE_ID`

### Notifications and background jobs

- `TELEGRAM_WEBHOOK_URL`
- `CRON_SECRET`
- `INNGEST_EVENT_KEY`
- `INNGEST_SIGNING_KEY`
- `INNGEST_BASE_URL`

`apps/web/vercel.json` schedules `/api/daily-stats` at `0 7 * * *`.

### Promotions and banners

- `NEXT_PUBLIC_PROMO_ENABLED`: enables promo banners, bonus-credit pricing, and
  promo metadata, not announcement banners.
- `NEXT_PUBLIC_ACTIVE_PROMO_BANNER`: promo ID from the banner registry and
  localized messages; requires `NEXT_PUBLIC_PROMO_ENABLED=true`.
- `NEXT_PUBLIC_ACTIVE_ANNOUNCEMENT_BANNER`: announcement ID, independent of the
  promo flag.
- `NEXT_PUBLIC_PROMO_ID`
- `NEXT_PUBLIC_PROMO_THEME`
- `NEXT_PUBLIC_PROMO_TRANSLATIONS`
- `NEXT_PUBLIC_PROMO_COUNTDOWN_END_DATE`
- `NEXT_PUBLIC_PROMO_BONUS_STARTER`
- `NEXT_PUBLIC_PROMO_BONUS_STANDARD`
- `NEXT_PUBLIC_PROMO_BONUS_PRO`

## Deployment constraints

### Feature gates

Review `apps/web/lib/features.ts` before shipping gated pages.
`VOICE_CLONING_PAGE_ENABLED` allows the public `/[lang]/voice-cloning` page in
previews and locally, but returns `404` in production while its demo audio is
placeholder material. The gate must also cover the landing feature card, footer
link, and sitemap. To ship the page, replace the placeholder audio and enable
the gate; remove the gate in a follow-up cleanup.

### Supabase

Verify migration compatibility and generated types before deploying code that
uses a changed schema. Keep privileged keys server-only and preserve RLS.
Application auth, retry, and cookie behavior is documented under
[Supabase access boundaries](../ARCHITECTURE.md#supabase-access-boundaries).

### Sentry

`apps/web/next.config.js` configures org `sexyvoiceai`, project `sexyvoice-ai`,
and the `/monitoring` browser tunnel. Source maps upload only when
`VERCEL_ENV=production`; do not expect uploads from preview deployments.
Confirm the production build uploads maps and that the tunnel reaches Sentry.

For incident investigation, use the existing
[Sentry application-log procedure](../scripts/README.md#2-correlate-sentry-application-logs)
rather than muting or resolving issues as a deployment check.

## Deployment verification

Verify the deployed commit and target environment before testing. Use test
accounts and avoid paid provider calls or production writes unless explicitly
intended.

| Changed integration  | Verify                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------ |
| Authentication       | Sign-in and OAuth redirects, refreshed session cookies, Supabase URL and key configuration             |
| Credits and payments | Stripe webhook configuration, correct price IDs, and balance display for the affected flow             |
| TTS or cloning       | Provider credentials and quotas, route errors in Sentry, R2 upload and playback on preview             |
| LiveKit              | `/api/call-token` token issuance, room connection, and agent name/dispatch matching the deployed agent |
| External API         | API-key authentication, Redis/rate limiting, dedicated R2 bucket/public URL, and Axiom request logs    |
| Storage              | Correct bucket and endpoint, object access, browser CORS, and playback/downloads                       |
| Docs                 | Custom domain, generated API reference, and links for changed endpoints                                |

Check Vercel runtime logs and Sentry for new errors after deployment. Validate
auth, payments, storage, and API keys after rotating secrets used by those flows.

Do not call production `/api/daily-stats` as a smoke test: it sends a Telegram
message. Use the [daily-stats verification and local benchmark guidance](../apps/web/app/api/daily-stats/README.md#verification)
for read-only checks and timing comparisons.
