# Supabase client upgrade

The implementation follows [the upgrade analysis](../../../../plans/2026-09-13-supabase-upgrade.md).
The shared catalog uses supabase-js 2.116.0; the web app uses SSR 0.12.7 and
postgrest-react-query 1.13.9 with transitive postgrest-core 0.13.1.

Use the SDK's retry policy for server reads and TanStack Query for dashboard
browser reads. A global fetch retry wrapper would also reach credit mutations;
it is unnecessary and increases the risk of duplicate writes.

Middleware needs its own request/response cookie adapter. Refresh writes must
reach both the downstream render and the browser while preserving locale
rewrites. OAuth callback redirects collect the cache headers supplied by SSR.
Server components retain the cookie-store adapter because they cannot write
response headers. The live retry and response rules are documented in
[DevOps](../../../../docs/devops.md#client-retries-and-auth-responses).

The Telegram bot's Deno import is outside the pnpm dependency graph and remains
on its existing version. No migration or operational refund/reset script is part
of this work.

The OAuth callback uses the legacy PKCE verifier, matching the default SDK
redirect configuration. Replay detection ignores per-flow slots and index cookies
left after an exchange. Tests cover these leftovers and active legacy verifiers,
including chunked cookies. Experimental flow-ID redirects are not enabled;
overlapping OAuth flows do not gain slot isolation from this upgrade alone.

## Verification

Node 24.10.0: `pnpm fixall` and `pnpm type-check` pass. The full test run,
`pnpm test -- --run --maxWorkers=2`, passes 1,050 web tests with 19 existing skips
and the script tests. The SDK integration tests use mocked HTTP responses to
verify retries, cancellation, credit POST behavior, and session cookie/cache
header forwarding through locale rewrites and auth redirects.

Playwright passes sign-in setup plus the call, credits, and history page smoke
checks against the local upgraded app in E2E mode. Browser binaries were installed
in a temporary directory; local watch polling was needed for the dev server.
Provider OAuth concurrency and password-reset email flows were not exercised live.
