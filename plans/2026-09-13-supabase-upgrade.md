# Supabase package upgrade analysis

Status: implemented on the upgrade branch; deployment is pending.
See the [implementation record](../.agents/notes/implemented/dependencies/2026-09-13-supabase-upgrade.md)
for decisions and completed verification. Version comparisons below describe the baseline.
Baseline: `origin/main` at `825b8d1a`; branch `codex/upgrade-supabase`.
Worktree: `/private/tmp/sexyvoice-upgrade-supabase`.

## Scope and targets

Reduce exposure to fixed auth/session bugs and adopt supported client packages.
The September 12 REST `504` remains a separate diagnosis; this upgrade does not
automatically retry that status.

Versions verified against npm on September 13, 2026:

| Package | Current | Target | Scope |
| --- | --- | --- | --- |
| `@supabase/supabase-js` | 2.99.2 | 2.116.0 | Shared catalog: web and operational scripts |
| `@supabase/ssr` | 0.8.0 | 0.12.7 | Web browser and server clients |
| `@supabase-cache-helpers/postgrest-react-query` | 1.13.8 | 1.13.9 | Dashboard server prefetch |
| `@supabase-cache-helpers/postgrest-core` | 0.13.0 | 0.13.1 | Transitive dependency of cache helpers |

These are minor/patch upgrades, not a new supabase-js major. SSR remains pre-1.0.
SSR 0.12.7 requires supabase-js `^2.114.0`, so upgrade them together.
The cache helper accepts PostgREST 2.x, TanStack Query 5.x, and React 19.
Let supabase-js select its matching auth, PostgREST, Realtime, Storage, and Functions
dependencies; do not introduce separate direct pins for those packages.

The Telegram bot has a separate `esm.sh/@supabase/supabase-js@2.99.2` import in
`apps/web/supabase/functions/telegram-bot/index.ts`. Keep that Deno deployment
separate from this pnpm upgrade, and record the remaining pin in the PR.

## Breaking changes and compatibility risks

No wholesale v2 API migration is indicated by the reviewed releases. The following
runtime and typing changes still require verification.

| Change | Version | Impact on this implementation |
| --- | --- | --- |
| Node 20 support removed; Node >=22 required | JS 2.110.0 | Repo and checked CI workflows use Node 24; compatible |
| `eq`/`neq` validate column names; mutations reject excess properties | JS 2.100.1 / 2.102.0 | Type-check generated `Database` queries and mutation payloads; fix actual mismatches without casts that suppress validation |
| PostgREST responses gain a `success` discriminator; builder and relation inference tightened | JS 2.102.0 onward | Inspect typed response mocks, cache-helper generics, nullable rows, and embedded relations |
| `maybeSingle` handling changes; `throwOnError` honored for multiple rows | JS 2.100.1 / 2.112.0 | Verify zero-row and multiple-row cases in billing, API authentication, CLI login, and application-state queries |
| Browser auth lock implementation replaced; custom `lock` deprecated | JS 2.107.0 onward | No custom lock found; smoke-test refresh and sign-out across tabs |
| `getClaims` returns an expired-JWT error; email-change single-confirmation `verifyOtp` can return null user/session | JS 2.107.0 / 2.106.0 | No matching application calls found; preserve current `getUser` authorization semantics |
| Local session cleared on sign-out failure | JS 2.110.2 | `apps/web/app/actions.ts` calls sign-out; verify redirect and cookie clearing during an auth outage |
| Realtime uses Phoenix; listeners cannot be added after joining; error values become Error objects | JS 2.100.0 / 2.101.0 / 2.103.3 | No application channel subscriptions found; low direct impact |
| Functions calls stop putting API keys in Authorization | JS 2.110.4 | No `functions.invoke` calls found; do not assume SDK key handling changes external API-key authentication |
| Storage signed-URL nullability and URL normalization changes | JS 2.103.x / 2.112.0 | No Supabase Storage SDK calls found; generated audio uses R2 |
| `setAll(cookies, headers)` supplies auth response cache headers | SSR 0.10.0 | Current server adapter accepts cookies only; explicitly propagate headers where responses are writable |
| Server auth initializes lazily with `skipAutoInitialize` | SSR 0.8.1 | Existing auth paths await `getUser`; validate refresh writes before responses finish |

SSR 0.12.0's changelog repeats older features, including the cookie-method rewrite
and an encoding change that was reverted. Do not treat every repeated entry as a
new migration requirement. The tagged 0.8.0-to-0.12.7 source comparison confirms
that our existing `getAll`/`setAll` pattern remains supported.

## Retry behavior: use the published package as the authority

The public retry guide claims `504` retries, POST retries, and jitter. The published
PostgREST 2.116.0 package and matching Git tag instead implement:

- Methods: GET, HEAD, OPTIONS only.
- HTTP statuses: 503 and 520 only, plus rejected network fetches.
- Three retries after the first attempt, with 1s/2s/4s delays, or `Retry-After`.
- No jitter in the default delay function; aborted requests are not retried.
- `db.retry: false` at client level or `.retry(false)` for a query disables retries.
- Default POST RPCs and mutations are not retried, protecting credit mutations
  from automatic replay when completion is uncertain.

Use the built-in policy for server reads initially. Verify it with a mocked fetch
against the installed target package. Do not add another global retry wrapper.
Browser credits queries already run through TanStack Query. Set `db.retry: false`
on the browser Supabase client to retain one retry owner for those queries; inspect
other direct browser reads so their retry behavior remains deliberate. This avoids
multiplying TanStack attempts by four SDK attempts during an outage.

Treat bounded `504` retries and a temporary-unavailability response for call-token
as a separate follow-up. Credit reads must succeed before issuing a call token.
The default retry delay is not a total request deadline; assess elapsed time and
an AbortSignal deadline separately if request latency requires it.

## Useful improvements

- Auth refresh stability: 2.108.2 preserves valid sessions on refresh failure and
  cools down repeated failures; later patches prevent unhandled refresh rejections
  and reduce expected transient-error logging noise.
- OAuth/PKCE reliability: JS 2.110.3 preserves verifiers, 2.111.0 gives overlapping
  flows separate verifier slots, and SSR 0.12.4 flushes slot removals. Relevant to
  our callback diagnostics and existing missing-verifier tests.
- Cookie correctness: SSR 0.12.1 deduplicates writes, 0.12.3 fixes domain-scoped
  deletion, and 0.12.6 avoids duplicate cache headers per client.
- Better diagnostics: PostgREST and auth errors gain JSON serialization support;
  auth 2.112.1 preserves 5xx messages. Useful for existing Sentry/error responses.
- Optional tracing: 2.112.0 provides an opt-in `/tracing` import for W3C context.
  Evaluate separately with Sentry's existing instrumentation and sampling.
- Cache helper 1.13.9 pulls core 0.13.1's comma parsing fix for array literals and
  nested filters. Our credits prefetch uses simple filters, so immediate benefit
  is limited, but the patch stays within the existing peer ranges.
- Passkeys, MFA recovery codes, richer Realtime filters, `stripNulls`, database
  OpenAPI inspection, and Storage lifecycle/versioning APIs are available. They
  are not required for this upgrade; database OpenAPI is not our external API v1.
- Token-only cookies already exist in SSR 0.8.0. Do not introduce a cookie format
  change as part of this upgrade.

## Implementation sequence

1. Update the catalog to 2.116.0, web SSR to `^0.12.7`, and cache helpers to
   `^1.13.9`; regenerate the lockfile with pnpm and inspect transitive versions.
2. Adapt auth response handling to consume SSR's cache headers. Review
   `lib/supabase/server.ts`, `lib/supabase/middleware.ts`, `proxy.ts`, and
   `app/auth/callback/route.ts`. Preserve cookies and cache headers on redirects
   and locale rewrites. Use response-aware cookie handling in middleware; retain
   the component-safe adapter where response headers cannot be written.
3. Keep one server client per request and the browser singleton. Configure the
   browser retry policy above; keep admin credit writes on default POST semantics.
4. Resolve actual type errors and update only mocks affected by the SDK contract.
   Avoid database schema changes and unrelated authentication redesign.
5. Add focused integration tests using the real SDK with mocked fetch: retryable
   reads, non-retried 504, non-retried credit POST, cancellation, and terminal errors.
   Test refresh cookie/cache-header forwarding, including redirect responses.
6. Run `pnpm fixall`, `pnpm type-check`, and `pnpm test`. Existing relevant suites
   include `auth-callback`, `oauth-callback-marker`, `call-token`, `api-auth`,
   `ensure-user-application-state`, `supabase-credit-transactions`, and `billing-usage`.
7. Smoke-test sign-in, overlapping OAuth flows, refresh, sign-out, password recovery,
   dashboard hydration/credits/history, and call-token in a suitable test environment.
   Mocked auth tests alone do not prove cookie behavior in a browser.
8. Update `docs/devops.md` with the chosen retry policy and auth cache handling.
   Record shipped decisions in an Agent Note. No external API schema change is
   planned; no OpenAPI regeneration or database migration is required.

## Release and rollback

Open a ready-for-review PR only after implementation checks pass. Do not deploy
or execute operational refund/reset scripts as validation. Observe auth callback
failures, REST status codes, request durations, and credits UI errors after release.
If regression appears, revert dependency, lockfile, and adapter changes together;
test active-session and in-flight PKCE compatibility before relying on rollback.

## Sources and verification

- [JS releases](https://github.com/supabase/supabase-js/releases): reviewed stable
  releases 2.99.3 through 2.116.0, including intermediate patch releases.
- [SSR changelog](https://github.com/supabase/ssr/blob/v0.12.7/CHANGELOG.md) and
  [tagged comparison](https://github.com/supabase/ssr/compare/v0.8.0...v0.12.7).
- [Retry constants](https://github.com/supabase/supabase-js/blob/v2.116.0/packages/core/postgrest-js/src/types/common/common.ts)
  and [implementation](https://github.com/supabase/supabase-js/blob/v2.116.0/packages/core/postgrest-js/src/fetchWithRetry.ts),
  cross-checked against the published npm tarball.
- [Retry guide with conflicting claims](https://supabase.com/docs/guides/api/automatic-retries-in-supabase-js).
- [Cache-helper patch](https://github.com/psteinroe/supabase-cache-helpers/commit/7f5de173579c0b0acbed4e348fd5f60a71492715).
- npm metadata verified target versions, Node requirement, and peer dependencies.
- Baseline `pnpm fixall` and `pnpm type-check` passed with existing lint warnings;
  no tracked source files changed. The shell used Node 26.7.0 and warned about
  the repo's Node 24 requirement. Run upgrade validation on Node 24.
- Upgrade verification passed on Node 24.10.0: formatting/lint, type-checking,
  the full unit suite, and sign-in plus three dashboard browser smoke checks.
  Live provider OAuth concurrency and password-reset email flows remain untested.
