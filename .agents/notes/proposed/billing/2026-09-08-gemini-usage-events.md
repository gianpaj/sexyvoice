# Gemini provider usage

Status: Code prepared; migration application and database tests pending.

Gemini usage must survive missing audio rows, blocked responses, fallback, and
storage failures. Schedule one provider attempt in `usage_events` per SDK generation.
Keep customer credit events separate and correlate with `request_id`.

Provider attempts own token counts and estimated supplier costs. Customer events
own credits. Copying costs to both would inflate sums. Storing tokens only in
`audio_files.usage` loses them when files are deleted or never created. Dedicated
numeric columns support aggregation; metadata retains the provider breakdown.

HTTP 400 and 500 failures are excluded at the user's request. Unknown token counts
and costs remain NULL. A recorded estimate does not establish that Google charged
for a failed or blocked generation.

The migration filters provider attempts out of customer operation counts while
including their costs in API spend. It preserves historical rows and append-only
semantics. Existing zero-credit support needs no change.

See `ARCHITECTURE.md#gemini-provider-usage` for the mechanism and `docs/devops.md`
for deployment order.

Verification uses Node 24.22.1 and the pinned pnpm 11.16.0. The seven affected
Vitest suites pass with 165 tests and 16 existing skips. All 72 script tests pass.
Workspace install, lint, type-check, and fixall pass with existing warnings. The
streaming suite exercises the disabled route with a test-only flag.

The full web run passes 111 files. Three files hit Redis setup and timing failures;
their single-worker retry passes all 105 tests with two existing skips. Every web
test file passes across those runs.

The docs build passes. The web build compiles and type-checks, then stops at page
data collection because `STRIPE_SECRET_KEY` is absent. Local database validation
requires a human-applied migration and a running Supabase database, as required
by AGENTS.md. Automatic approval review rejected `pnpm test:db` under the no-write
rule; no migration or database test SQL ran.

Review decisions: Non-streaming writes use Next.js `after()` to avoid delaying
fallbacks. Streaming writes remain awaited in the background task. Unknown model
pricing and unavailable SDK HTTP status stay NULL. Cancellation is independent
of provider outcome. Zero-token telemetry does not waive customer credits.

Customer reports, Telegram statistics, dispute evidence, and the unexplained-credit
audit exclude provider-only activity. Internal model cost groups remain intact.
Extra indexing and enum changes are deferred without workload evidence. Raw usage
metadata preserves provider breakdowns for reconciliation. Fallback pgTAP coverage is prepared but
awaits the migrated local database.

Main integration retains request-scoped query caching, Gemini prompt building,
date-based pricing, and the current CI configuration. The shared contract with
sexycall keeps `xai_conversation_id`, `xai_response_id`, and `xai_response_ids` on
`call_sessions.metadata`. Gemini counts, event kinds, costs, and correlation IDs
remain in `usage_events` with their existing column names.

Retention queries still treat any usage event as account activity. The author must
decide whether a profile with only failed provider attempts should remain exempt
from empty-profile cleanup. The coordinator authorized preserving this rule
without a policy change.
