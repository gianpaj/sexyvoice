# Daily stats

`route.ts` sends the daily Telegram report. `contribution.ts` calculates usage
contribution for yesterday and the last 30 complete UTC days.

## Usage contribution

Net collections are cash purchases/top-ups minus cash refunds. Manual grants,
credit-only refunds, and chargeback credit holds/releases do not affect cash.
Usage is paid if it occurs at or after the customer's first positive cash
purchase; promotional credits spent by paying customers remain paid usage.

Estimated contribution equals net collections minus all measured usage costs.
Free coverage equals net collections minus paid usage costs, divided by free
usage costs. Zero free cost renders coverage N/A. Unpriced or unclassified
records mark coverage incomplete; displayed dollars include only priced records.

This is a cash-period comparison before payment fees and fixed costs, not
accounting profit. Taxes, final dispute losses, unlogged provider attempts,
retries, and ancillary infrastructure can be absent from the inputs.

## Cost sources

`contribution-queries.ts` reads usage events and supplements finalized calls
missing an event. Cross-window ID lookups prevent duplicate call estimates.
Events use `occurred_at`; supplemental sessions use `ended_at`, falling back to
`started_at` for terminal legacy rows. Supplemental records add no credits.

`apps/web/lib/usage-costs.ts` prefers positive recorded costs and uses supported
model-specific estimates when data permits. Recorded costs are not necessarily
invoice-verified. Unknown models, missing dimensions, and negative sentinels stay
unpriced. Zero-duration calls can use a valid sub-second timestamp difference.
Call duration estimates omit text/tool charges; stored call costs can reflect
customer billing buckets rather than provider-billed time.

Rate references: [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing)
and [xAI pricing](https://docs.x.ai/developers/pricing).

The report prints two lines per period. Detailed feature and diagnostic totals
remain in the aggregation result.

## Verification

Run `pnpm --filter @sexyvoice/web exec vitest run tests/daily-stats-contribution.test.ts tests/daily-stats-contribution-queries.test.ts`.
Use read-only queries to investigate actual records. Do not invoke the production
GET handler for verification; it sends the Telegram report.
