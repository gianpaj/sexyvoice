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

Estimated contribution equals net collections minus recorded and estimated usage costs.
Free coverage equals net collections minus paid usage costs, divided by free
usage costs. Zero free cost renders coverage N/A. Unpriced or unclassified
records mark coverage incomplete; displayed dollars include only priced records.
The separate coverage alert fires when more than 5% of records are unpriced, or
any usage is unclassified. Record share controls alert noise, not cost accuracy;
one expensive unknown record can matter even below that threshold. When the
coverage alert is off, negative contribution triggers the usage-cost alert.
Free coverage still stays incomplete for any gap; the alert tolerance does not
establish dollar accuracy.

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
Call duration estimates omit xAI's $0.004 per text input and tool charges. For
example, 10 text inputs add $0.04, equal to 80% of a one-minute $0.05 audio
estimate or 50% of a one-minute $0.08 estimate. This illustrates sensitivity,
not observed input volume; the report cannot quantify the omitted total from
duration alone. Stored call costs can reflect customer billing buckets rather
than provider-billed time.

Rate references: [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing)
and [xAI pricing](https://docs.x.ai/developers/pricing).

The report prints two lines per period. Aggregation retains the costs and
coverage counts used by the report. Linked audio token counts take precedence
over event metadata; valid event counts remain a fallback for missing values.

Contribution reads both usage and transactions fresh, even during local cached
activity debugging, so customer classification and collections use fresh payment
history. This intentionally requires an all-time transaction read on that path.

## Query load

A single page returning `504 Gateway Timeout` fails the whole run, so
`fetchAllPages` replays a page up to four times with exponential backoff on
transient gateway or connection failures (502/503/504, `ETIMEDOUT`, dropped
sockets) and on retryable SQLSTATEs such as `57014`. Every caller only reads, so
replaying a page is safe. Non-transient errors still fail the run on the first
response.

`fetchAllPages` pages with a keyset cursor, not `LIMIT/OFFSET`: an offset page
makes Postgres sort and then discard every row it skips, so the deepest pages
are both the slowest and the ones that time out. A query passes its ordering
column as the cursor and applies it with `applyPageCursor`; it must therefore
select both that column and `id`, and order by `(column asc, id asc)`. The seek
is inclusive (`gte`) and excludes the ids already returned at that exact value,
so rows sharing a timestamp are neither skipped nor duplicated. Two guards turn
a mis-specified query into an error instead of a loop: a cursor value that moves
backwards, and more than 200 rows sharing one value.

Credit transactions are read once for all time and sliced in memory for every
reporting window. The per-period reads this replaced were subsets of that same
range with identical filters and were merged straight back into it, so they
added load without adding rows. Add new windows as in-memory filters over
`allCreditTransactions`, not as extra queries.

Usage events carry no `profiles(username)` embed — PostgREST joins an embed per
row, and the report labels only its top three users. Resolve names for the few
ids actually shown with `getProfileUsernamesByIds`. Credit transactions keep
their embed: that read feeds the top-customer list, which needs many names.

Every paginated read is wrapped in `_timed`. Leaving one untimed makes a failure
inside it look like it came from whatever ran next.

## Local benchmarking

In development, `?cache=off` skips reading and writing
`apps/web/.daily-stats-cache.json` without deleting the file. Successful bypass
responses include `X-Daily-Stats-Cache: bypass` and `Cache-Control: no-store`.
Production ignores this parameter and retains cron authentication.

With `pnpm dev` running, open
`https://sv.dev/api/daily-stats?date=2026-09-12&cache=off`, or run from the repo root:

```sh
node scripts/benchmark-daily-stats.mjs --label branch --date 2026-09-12
```

The runner excludes one warmup and measures five sequential requests. It checks
HTTP status, the bypass header, and a nonempty text report. Results include total
time, time to first byte, report hashes, and min/median/max timings. Reports and
headers stay in private files under the ignored
`scripts/.cache/daily-stats-benchmark/` directory. Treat these files as financial
data; do not commit or share them. `--help` lists options.

Compare versions with the same cache bypass patch, date, URL, environment, and
run count. Switch versions only between runs and warm up each version before
measuring. Do not benchmark versions concurrently against the same database.
Database buffers and upstream caches are not cleared. After a client timeout,
wait for the server request to finish before another run. Local mode does not
send Telegram reports, but still requires `TELEGRAM_WEBHOOK_URL` to be set.

## Verification

Run `pnpm --filter @sexyvoice/web exec vitest run tests/daily-stats-contribution.test.ts tests/daily-stats-contribution-queries.test.ts tests/daily-stats-completed-calls.test.ts tests/daily-stats-fetch-all-pages.test.ts`.
Use read-only queries to investigate actual records. Do not invoke the production
GET handler for verification; it sends the Telegram report.
