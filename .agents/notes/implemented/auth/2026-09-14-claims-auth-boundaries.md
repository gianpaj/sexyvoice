# Claims authentication boundaries

## Decision

Use `getVerifiedClaims()` for identity-only checks in dashboard pages, server
actions, session-authenticated APIs, browser analytics, and call cache refreshes.
Callers require `claims.sub`; database ownership, credits, and entitlements remain
separate authorization checks. Do not fabricate a Supabase `User` from a JWT.

Retain six `getUser()` calls for current email, Auth creation time, account
cleanup, and durable credential issuance. The canonical method policy and exact
exceptions live in [Architecture](../../../../ARCHITECTURE.md#identity-and-session-handling).

## Alternatives and consequences

- Replacing every lookup would use token-era email for Stripe customer linking
  and password verification, and cannot supply Auth `created_at`.
- Keeping every mutation on `getUser()` adds a network lookup where only identity
  is needed. Claims do not weaken the existing owner and entitlement filters.
- Local JWT verification does not enforce immediate session revocation. Fresh
  user lookups are not a substitute for recent-login or explicit session checks.

## Implementation and verification

The work is grouped into dashboard/UI, data-management APIs, and generation APIs.
Tests exercise valid claims without `getUser()`, missing subjects, and verification
errors before user-scoped queries, mutations, providers, or credit charges.
Shared test mocks keep `getClaims()` independent of `getUser()`.

Validation passed: `pnpm fixall`, `pnpm type-check`, and the full web suite via
`pnpm --filter @sexyvoice/web exec vitest run`: 88 files, 1,239 passing tests,
19 skipped. Script tests passed in the root test run. The local web run uses the
test-owned in-memory Redis server; `CI=true` requires a localhost Redis service.

Independent review found no issues. The final source audit confirms exactly six
remaining Auth user lookups and one direct `getClaims()` call inside the wrapper.
No database schema, environment variables, or external API v1 contracts change.
