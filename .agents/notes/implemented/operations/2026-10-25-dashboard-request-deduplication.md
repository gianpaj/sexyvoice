# Dashboard request deduplication

## Problem

One dashboard page load sent 37 server-side Supabase requests. Most of them
repeated work the request had already done:

- The proxy ran on every link prefetch. Each prefetch cost one Auth `/user`
  request and one `profiles` lookup from `ensureUserApplicationState()`.
- The layout read every `credit_transactions` column to sum `amount`, and
  Generate, Clone, and Call read the same rows again.
- `CreditsSection` mounts twice on Generate, Clone, and Call (sidebar and
  mobile copy). Each copy repeated the browser analytics lookups.

Session tokens are HS256-signed, so `getClaims()` cannot verify them locally
and every `getVerifiedClaims()` call is an Auth `/user` request. The JWKS
publishes an ES256 key, but that key does not sign the current tokens.

## Decisions

### Proxy skips link prefetches

The `missing` header rule sits inside the matcher object in
`apps/web/proxy.ts`. At the top level of `config`, Next.js ignores it.

Any client can send `next-router-prefetch`, so the proxy redirect is not an
auth boundary. The canonical rule lives in
[Architecture](../../../../ARCHITECTURE.md#identity-and-session-handling).
Locale handling needs no proxy: next-intl reads the locale from `[lang]`.

### Shared credit amounts

`getCreditTransactionAmounts()` in `apps/web/lib/supabase/queries.ts` selects
only `amount` and uses React `cache()`. The dashboard layout and the
Generate, Clone, and Call pages share one query per request. `hasUserPaid()`
uses the same per-request cache. The cache lasts for one server render, so a
purchase shows on the next request.

### One analytics copy

`CreditsSection` identifies the user to PostHog and Crisp only when
`identifyUser` is set. The sidebar copy in `dashboard.ui.tsx` sets it; the
mobile copies on pages do not.

## Rejected: per-render claims cache

The proxy, the dashboard layout, and the page each call
`getVerifiedClaims()`, but a page load sends two Auth requests, not three.
The layout and page calls already share one request, most likely through
Next.js fetch memoization within a render. The proxy runs before the render
and cannot share it. A cached claims helper would save no requests and would
touch about 28 call sites and their mocks.

## Remaining candidates

- Make the ES256 key the active Supabase signing key. `getClaims()` would then
  verify locally on the server and in the browser. Existing HS256 sessions
  keep working until they expire. This is a production Auth change for a
  human to make.
- Pass the server's claims and paid status to the sidebar `CreditsSection`,
  removing the browser Auth and paid-status requests.
- The layout's React Query prefetch and the Generate and Clone balance check
  both read `credits`. They handle errors differently, so sharing them needs
  a decision about error reporting.

## Verification

`next start` served a production build with a Node preload that logs each
server `fetch` to Supabase. A Playwright script loaded each page as the E2E
user, waited five seconds, and recorded browser Supabase requests. The
script ran outside the repository.

| Page     | Step                 | Server | Browser |
| -------- | -------------------- | -----: | ------: |
| Generate | Baseline             |     37 |       5 |
| Generate | Proxy skips prefetch |      9 |       5 |
| Generate | Shared credit query  |      8 |       5 |
| Generate | One analytics copy   |      8 |       3 |
| History  | Baseline             |     37 |       3 |
| History  | Proxy skips prefetch |      9 |       3 |
| History  | Shared credit query  |      9 |       3 |

A logged-out request with the prefetch header to each of the nine dashboard
pages read no user data and made no Supabase queries. A logged-out page load
still redirects to login.

`pnpm fixall`, `pnpm type-check`, and `pnpm test` passed. The full Playwright
suite passed against a production E2E build: 119 passed, 1 skipped.
