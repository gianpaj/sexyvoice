# Dashboard request deduplication

## Status

In progress on `feat/dashboard-prefetch-skeletons` (PR #654).

## Problem

One dashboard page load sends 37 server-side Supabase requests. Most of them
repeat work that the request already did:

- The proxy runs on every link prefetch. Each prefetch costs one Auth
  `/user` request and one `profiles` lookup from
  `ensureUserApplicationState()`.
- Session tokens are HS256-signed. `getClaims()` cannot verify them locally,
  so every `getVerifiedClaims()` call is an Auth `/user` request. The JWKS
  publishes an ES256 key, but that key does not sign the current tokens.
- The dashboard layout and its page each verify claims.
- The layout reads every `credit_transactions` column to sum `amount`, and
  Generate, Clone, and Call read the same rows again.
- `CreditsSection` mounts twice on Generate, Clone, and Call (sidebar and
  mobile copy). Each copy repeats the browser analytics lookups.

## Measurement

`next start` runs a production build with a Node preload that logs each
server `fetch` to Supabase. A Playwright script loads each page as the E2E
user, waits five seconds, and records browser Supabase requests. The script
runs outside the repository.

| Page     | Step                 | Server | Browser |
| -------- | -------------------- | -----: | ------: |
| Generate | Baseline             |     37 |       5 |
| Generate | Proxy skips prefetch |      9 |       5 |
| History  | Baseline             |     37 |       3 |
| History  | Proxy skips prefetch |      9 |       3 |

Baseline server breakdown for Generate: 16 Auth `/user`, 15 `profiles`,
2 `credits`, 3 `credit_transactions`, 1 `voices`.

## Proxy skips link prefetches

The `missing` header rule must sit inside a matcher object. At the top level
of `config`, Next.js ignores it, so every prefetch ran the proxy. Moving the
rule into the matcher removed 14 Auth and 14 `profiles` requests per page.

Trade-off: any client can send `next-router-prefetch`, so the proxy redirect
is a convenience, not an auth boundary. Every dashboard page and layout checks
claims before reading user data. A logged-out request with the header to each
of the nine dashboard pages returned no user data and made no Supabase
queries. A logged-out page load still redirects to login.

Locale handling needs no proxy: next-intl reads the locale from `[lang]`, and
public routes already skip the i18n middleware.

## Plan

1. Exclude prefetch requests from the proxy matcher. Done.
2. Share per-request credit transaction amounts and run the browser
   analytics effect in one `CreditsSection` copy.
3. Verify claims once per Server Component render.
