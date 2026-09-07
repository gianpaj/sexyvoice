# Daily stats

`route.ts` sends the daily Telegram report. `contribution.ts` calculates usage
contribution for yesterday and the last 30 complete UTC days.

## Completed calls

The completed-call line matches the admin dashboard: `status = 'completed'`
and `duration_seconds > 10`, regardless of end reason. It counts calls
by `started_at` for yesterday and 14 complete UTC days. Total calls and usage
costs include other sessions. Short calls alone do not establish a failure.

## Usage contribution

Net collections are cash purchases/top-ups minus cash refunds. Manual grants,
credit-only refunds, and chargeback credit holds/releases do not affect cash.
Usage is paid if it occurs at or after the customer's first positive cash
purchase; promotional credits spent by paying customers remain paid usage.

Estimated contribution equals net collections minus all measured usage costs.
Free coverage equals net collections minus paid usage costs, divided by free
usage costs. Zero free cost renders coverage N/A. Unpriced or unclassified
records mark coverage incomplete; displayed dollars include only priced records.
The separate coverage alert fires when more than 5% of records are unpriced, or
any usage is unclassified. Record share controls alert noise, not cost accuracy;
one expensive unknown record can matter even below that threshold.

This is a cash-period comparison before payment fees and fixed costs, not
accounting profit. Taxes, final dispute losses, unlogged provider attempts,
retries, and ancillary infrastructure can be absent from the inputs.

## Cost sources

`contribution-queries.ts` reads usage events and supplements finalized calls
missing an event. Cross-window ID lookups prevent duplicate call estimates.
Events use `occurred_at`; supplemental sessions use `ended_at`, falling back to
`started_at` for terminal legacy rows. A linked event outside the window belongs
to the period containing its `occurred_at`, rather than the session's end date.
ID lookups use 100-ID batches, with at most four concurrent batches per lookup,
and skip link checks for sessions already matched to an in-window event.

`apps/web/lib/usage-costs.ts` prefers positive recorded costs and uses supported
model-specific estimates when data permits. Recorded costs are not necessarily
invoice-verified. Unknown models, missing dimensions, and negative sentinels stay
unpriced. Zero-duration calls can use a valid sub-second timestamp difference.
Call duration estimates omit text/tool charges; stored call costs can reflect
customer billing buckets rather than provider-billed time.

Rate references: [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing)
and [xAI pricing](https://docs.x.ai/developers/pricing).

The report prints two lines per period. Aggregation retains the costs and
coverage counts used by the report. Linked audio token counts take precedence
over event metadata; valid event counts remain a fallback for missing values.

Contribution reads both usage and transactions fresh, even during local cached
activity debugging, so customer classification and collections use fresh payment
history. This intentionally requires an all-time transaction read on that path.

## Verification

Run `pnpm --filter @sexyvoice/web exec vitest run tests/daily-stats-contribution.test.ts tests/daily-stats-contribution-queries.test.ts tests/daily-stats-completed-calls.test.ts`.
Use read-only queries to investigate actual records. Do not invoke the production
GET handler for verification; it sends the Telegram report.
