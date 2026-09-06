# Daily usage costs and contribution

Status: proposed implementation plan. No runtime changes are included.

## Outcome

Show whether collected revenue covers paid and free customers' measured usage costs, excluding fixed costs. Report yesterday and the last 30 complete UTC days. Keep existing 14-day activity statistics.

The headline is **estimated contribution before payment fees and fixed costs**. This is a cash-period comparison, not recognized revenue or accounting profit. Purchases and consumption can fall in different periods.

## Approach

Use recorded usage costs, with explicit provider/model estimates for missing costs. This is the recommended balance of scope and usefulness.

Alternatives considered:

- Convert every credit at one rate: small change, but wrong for different providers, models, free-user surcharges, and zero-credit calls.
- Reconcile provider invoices and Stripe balance transactions: more complete, but requires additional integrations and reconciliation. Defer it.

## Definitions

- Revenue: cash dollar amounts on qualifying purchase/top-up transactions within the period. Exclude manual grants, freemium grants, and internal users. Reuse existing transaction filtering and refund classification.
- Refunds: actual cash refund amounts, normalized to positive deductions. Credit-only refunds and chargeback hold/release ledger movements do not reduce cash revenue. Do not fabricate dollar values from refunded credits.
- Net collections: revenue minus cash refunds. Payment fees, taxes, final dispute losses, and unrecorded adjustments are outside this first version; document these limits alongside the metric.
- Paid usage: activity at or after the user's first qualifying cash purchase. Use all-time purchase history to find that timestamp. A later purchase must not reclassify earlier free usage.
- Free usage: activity before the first qualifying purchase, or activity by a user who has never purchased. This describes customer payment status, not the provenance of individual credits.
- Promotional credits spent by paying customers remain paid-customer usage. Exact free-credit attribution requires a separate credit-allocation ledger and is out of scope.
- Preserve `free_call` counts as a separate existing metric. Do not silently equate that flag with the new timestamp-based customer classification.
- Missing identity or contradictory classification evidence must be surfaced as unclassified usage, not silently treated as free.

For each period:

```text
net collections = purchases and top-ups - cash refunds
available to cover free usage = net collections - paid usage cost
estimated contribution = net collections - all measured usage costs
free usage coverage = available to cover free usage / free usage cost
```

All measured usage costs include unclassified usage. If unclassified or unpriced usage exists, label coverage as incomplete and avoid a definitive coverage claim. If free cost is zero, render coverage as N/A. Preserve negative contribution and negative coverage. Round only for display.

## Evidence and limitations

- `apps/web/app/api/daily-stats/route.ts` values paid credits at $0.0004 and estimates all calls at $0.05 per duration minute. Neither is the proposed contribution metric.
- `apps/web/app/api/daily-stats/queries.ts` omits cost fields from usage events. Its transaction fetch already includes all-time purchase history.
- `apps/web/lib/api/pricing.ts` contains model/provider rates and token-based calculations. Inspect its callers before reuse: a supported price lookup and missing price lookup can both return zero.
- `apps/web/app/api/generate-voice/route.ts` records some non-stream costs; its streaming path omits `dollarAmount`. Streaming token data can be available in linked `audio_files.usage`.
- `apps/web/lib/utils.ts:getDollarCost` returns estimates for some clone providers and `-1` for unsupported cases. Negative values are missing-cost sentinels, not refunds.
- In the inspected call service, calls under 10 seconds have zero calculated credits and `usage_events.py` skips their usage event. Calls of at least 10 seconds calculate credits in rounded-up 30-second blocks and attempt usage insertion for both free and paid users. `free_call` identifies a user who has never paid; it does not mean zero credits consumed. Call sessions supplement the ledger for short, zero-credit calls and failed usage inserts.
- Admin pricing includes model-specific call rates, but the inspected local `sexycall/src/billing.py` uses a flat $0.05 rate. Verify model and recorded-cost semantics before treating either repository as authoritative.
- Usage inserts are best-effort. Successful-event costs can omit failed provider attempts, retries, and ancillary variable infrastructure costs. Describe this as measured generation/call cost coverage, not complete operating profitability.

## Implementation steps

### 1. Establish cost inputs and pure calculations

Create `apps/web/lib/usage-costs.ts` for reusable cost resolution and `apps/web/app/api/daily-stats/contribution.ts` for period aggregation. Keep database access and Telegram rendering outside these helpers.

Return an amount plus a cost basis: recorded, estimated, or unknown. Recorded means stored by the application, not invoice-verified. Track counts and cost subtotals by basis.

Audit each source's writer before accepting its `dollar_amount`. Accept finite positive values with understood provider-cost semantics. Accept zero only when it represents known zero provider usage; otherwise estimate or classify as unknown. Reject negative and non-finite amounts.

For missing speech/clone costs, use verified provider/model rates and available token counts, characters, duration, or request billing data. Reuse supported existing calculations. Inspect actual model identifiers, including fallbacks. Do not use one Gemini model's pricing for all speech or a universal per-credit fallback.

Fetch linked audio metadata only in batches for events needing it; do not fetch full text or one record per event. Use character lengths and recorded usage dimensions. A row lacking sufficient evidence stays unknown.

Before adding or changing rate constants, verify them against provider documentation and existing billing code. Record rate provenance and historical applicability. Never apply a newly discovered current rate indiscriminately to historical usage.

### 2. Fetch complete reporting data

Use `usage_events` as the primary ledger for every feature, including ordinary calls by free users spending free credits. Extend paginated usage queries to cover 30 days and include source ID, model, dollar amount, unit/quantity, input/output dimensions, and necessary metadata. Derive yesterday and existing 14-day windows from these results. Do not filter events to paying users before calculating costs.

Attribute ledger entries by `occurred_at`, including `live_call` entries. Classify customers using their purchase history at that timestamp. This keeps normal call usage on the same reporting basis as other features. Leave existing call activity counts and their start-time windows unchanged.

Read call sessions as supplementary data, with session ID, user ID, start/end time, duration, billed minutes, model, status, credits, and `free_call`. Fetch sessions linked to ledger entries when needed for model/duration evidence, plus finalized sessions ending in the reporting window to find missing events. Use stable pagination and existing internal-user exclusions. For terminal legacy sessions without an end time, use `started_at` as an explicitly counted fallback.

For each ledger call, prefer valid recorded cost after the writer audit, then a supported model-specific estimate using linked session evidence. Count its credits and cost once. A missing linked session does not invalidate an otherwise usable event; surface missing evidence when it prevents costing.

Add a session-only cost record only when no matching `live_call` event exists. Check matching `source_id` values in batches without restricting that lookup to the report window, so an event across midnight cannot cause the session to be counted twice. If an event exists, its `occurred_at` determines inclusion; otherwise attribute the supplemental record by session end time. Report session-only record counts separately for short zero-credit calls and other missing-event cases. Do not synthesize consumed credits for missing events or infer that a free customer lacks an event.

For short zero-credit calls, confirm whether the provider charges and which duration/rate applies. Customer billing's 10-second threshold and 30-second blocks do not establish provider billing rules. Estimate from supported provider/model evidence or mark the cost unknown; do not automatically assign zero cost or a customer billing block. Apply the same evidence rules to other missing-event sessions.

Do not add session-only estimates for ongoing calls. Surface their count. Include terminal sessions with provider usage even if their status is not successful. Best-effort or delayed usage insertion remains a telemetry limitation; do not invent costs for completely unlogged attempts.

Version the local report cache. Reject cached data missing the new fields or 30-day window. Query failures must fail the contribution calculation visibly, never become empty/zero-cost results. Do not invoke the live GET route during verification because it sends Telegram messages.

### 3. Add the report section

Add a compact section for yesterday and 30 days containing net collections, paid usage cost, free usage cost, total cost, estimated contribution, and free-cost coverage.

Break out free-customer consumed credits and provider dollars for speech, cloning, calls, and audio processing/other usage. Include dashboard and API sources in total costs. Keep enhancement operations counted once rather than hiding them outside cloning's related usage costs.

Show recorded/estimated/unknown event counts, unclassified cost, and pending call counts. Unknown costs must be visible next to contribution, not only in logs. Use a conditional result such as "coverage incomplete" when data cannot support yes/no.

Replace the retail burn warning as the financial health signal. If retaining retail credit value, label it as retail usage value and keep it separate from provider costs. Generate existing call-cost text from the same cost resolver to avoid conflicting totals.

### 4. Verify and document

Add focused tests for cost resolution and contribution aggregation, then reporting integration tests with mocked reads and delivery. Cover:

- Free speech and clones, paid customers, purchase-day transitions, and old purchasers.
- Non-stream and streaming speech, different models, null/zero/negative costs, missing dimensions, and estimates.
- Ordinary calls by both free and paid users with usage events; calls below 10 seconds without events; the exact 10-second threshold; missing inserts; linked call deduplication; events without sessions; model rates; and midnight boundaries.
- Zero revenue, zero free cost, cash refunds, credit-only refunds, chargeback holds/releases, and manual grants.
- API and enhancement costs, unclassified users, ongoing calls, incomplete cost coverage, pagination, stale caches, and query failures.
- Known fixture: $100 revenue, $5 cash refunds, $20 paid cost, $15 free cost yields $60 contribution and 5x coverage. Adding an unknown-cost event makes coverage incomplete.

Run the focused tests, `pnpm fixall`, `pnpm type-check`, and `pnpm test`. Inspect formatter changes for unrelated edits. Compare a mocked report against the fixture; any production reconciliation must be read-only and must not send Telegram messages.

Update `docs/devops.md` with definitions, cost limitations, cache behavior, and safe verification instructions. During implementation, keep the decision record under `.agents/notes/proposed/reporting/` and move it to `implemented/` only after shipping. No migrations, backfills, billing changes, new provider calls in the cron, or new package are required by this plan.

## Later handoff prompt for sexyvoice-admin

Implement the daily-stats contribution metrics in sexyvoice-admin after the SexyVoice implementation is complete. Read `plans/2026-09-06-daily-stats-usage-contribution.md` in the SexyVoice repository and inspect its final `usage-costs.ts`, `contribution.ts`, queries, tests, and operational documentation. Follow the final shipped contract if it differs from this proposal.

The goal is to show whether net collections cover paid and free customers' measured provider costs. Inspect `src/lib/pricing.ts`, `src/lib/gemini-pricing.ts`, and `src/lib/data/financials.ts`: the financial queries filter to paid users, and blanket fallback pricing must not hide missing costs.

Match the daily report's UTC periods, purchase-time customer classification, cash refund handling, cost provenance, provider/model fallbacks, event-time attribution, session/event deduplication, and incomplete-coverage behavior. Ordinary calls by free and paid users already attempt usage insertion. Use call sessions to supplement short zero-credit calls and other missing-event cases, following the shipped fallback rules. Preserve the distinction between free customers and promotional credits spent by paying customers. Include API and audio-processing costs.

Extend the financial overview and daily series with net collections, free/paid costs, total measured costs, estimated contribution, and free-cost coverage. Show per-feature free usage credits and costs, recorded/estimated/unknown coverage, and unclassified usage. Label the result before payment fees and fixed costs; do not call it accounting profit. Keep paid-user engagement metrics clearly scoped.

Reuse the implementation's fixtures to prove numerical parity for identical inputs. Do not import files directly across repositories or introduce a shared package solely for this work. Keep cost rules in one module inside the admin repository and document their source. Inspect applicable UI skills before modifying the interface.

Run required repository checks and focused tests, verify desktop/mobile presentation, and document remaining telemetry gaps. Keep database work read-only. Do not deploy, apply migrations, alter customer billing, or send notifications as part of this task.
