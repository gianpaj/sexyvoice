# Daily stats

`route.ts` sends the daily Telegram report. `contribution.ts` calculates usage
contribution for yesterday and the last 30 complete UTC days.

The refund line shows yesterday's and all-time dollar amounts from
`metadata.dollarAmount`. Credit-only refunds and credit resets contribute $0;
the report omits refund transaction counts.

## Completed calls

The completed-call line matches the admin dashboard: `status = 'completed'`
and `duration_seconds > 10`, regardless of end reason. It counts calls
by `started_at` for yesterday and 14 complete UTC days. Total calls and usage
costs include other sessions. Short calls alone do not establish a failure.

## Usage contribution

Net collections are cash purchases/top-ups minus cash refunds. Manual grants,
credit-only refunds, and chargeback credit holds/releases do not affect cash.

Estimated contribution equals net collections minus recorded and estimated usage
costs and allocated overhead. Displayed dollars include only priced records;
unpriced counts stay visible beside the contribution.

The `coverageAlert` flag triggers a data-quality alert when more than 5% of
records are unpriced. This threshold controls alert
noise, not cost accuracy: one expensive unknown record can matter below it.
When `coverageAlert` is false, negative contribution triggers the
usage-and-overhead alert.

This is a cash-period comparison before payment fees, not
accounting profit. Taxes, final dispute losses, unlogged provider attempts,
retries, and ancillary infrastructure can be absent from the inputs.

## Overhead estimates

`overhead-costs.json` stores the manually maintained USD invoice baseline;
`overhead.ts` allocates it over reporting windows. Update the baseline when newer
invoices are available. Missing invoices are unknown, not zero. This estimate
uses the same invoice baseline for every report date; LiveKit applies only from
its subscription start date. It does not reconstruct historical infrastructure bills.

The source is the `Purchases 2026` CSV export from the contracting purchases
spreadsheet, reviewed on 2026-10-15. Amounts use its USD column, including VAT
where recorded, without additional currency conversion. July–September invoice
averages cover Vercel, Fly.io, and Cloudflare. Invoice dates can follow usage:
the September Fly.io and Cloudflare invoices cover August usage.

Fly.io's $72 annual machine reservation is allocated at $6/month in addition
to its monthly invoices. Monthly averages are multiplied by 12/365 and the
window's UTC day count; round only for display. The invoice and reservation
baseline is about $73.14/month or $2.40/day. LiveKit adds $50/month from
2026-11-01, using the same 12/365 daily allocation for the portion of the window
on or after that date. This assumes expected WebRTC participant minutes
(per participant) are included, with no additional per-minute estimate.
Fly.io and LiveKit are attributed entirely to voice calls and included once in overhead.
Vercel and Cloudflare are entirely attributable to SexyVoice.
The Calls section shows `AI usage (est.)`, excluding hosting already in overhead.

September's positive $29.59 Vercel entry is treated as the final charge. Its
description says "partial refund"; confirm that interpretation against the
invoice before treating the baseline as reconciled.

Supabase, Upstash, Sentry, Dash0, Axiom, PostHog, Inngest, and email
are confirmed free by the owner. Inworld, Hetzner, and domain purchases are
excluded because their attribution to SexyVoice is unconfirmed. AI-provider
invoices and prepaid credit purchases are excluded from overhead to avoid
duplicating usage costs. Hosting is not split across user cohorts.

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
Grok voice calls are estimated at $0.08 per minute. `grok-voice-think-fast-1.0`
calls that started before 2026-09-13 06:00 UTC use $0.05, the rate xAI billed
until it moved 1.0 to the 2.0 price.

Call duration estimates omit xAI's $0.004 per text input and tool charges. For
example, 10 text inputs add $0.04, equal to 50% of a one-minute $0.08 audio
estimate. This illustrates sensitivity, not observed input volume; the report
cannot quantify the omitted total from duration alone. Stored call costs can
reflect customer billing buckets rather than provider-billed time.

Rate references: [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing)
and [xAI pricing](https://docs.x.ai/developers/pricing).

Each period shows remaining collections and a collections/usage/overhead breakdown
in two short lines, with unpriced counts when present. Invoice
provenance and call-estimate limitations stay in this README. Linked audio token counts take precedence
over event metadata; valid event counts remain a fallback for missing values.

Contribution uses fresh usage and collections even during local cached activity
debugging. See [Query load](#query-load) for transaction read windows.

## Query load

A single page returning `504 Gateway Timeout` fails the whole report, so
`fetchAllPages` replays a page up to four times with exponential backoff on
transient gateway or connection failures (502/503/504, `ETIMEDOUT`, dropped
sockets) and on retryable SQLSTATEs such as `57014`. Every caller only reads, so
replaying a page is safe. Non-transient errors still fail the report on the
first response.

`fetchAllPages` pages with a keyset cursor, not `LIMIT/OFFSET`: an offset page
makes Postgres sort and then discard every row it skips, so the deepest pages
are both the slowest and the ones that time out. A query passes its ordering
column as the cursor and applies it with `applyPageCursor`; it must therefore
select both that column and `id`, and order by `(column asc, id asc)`. The seek
is inclusive (`gte`) and excludes the ids already returned at that exact value,
so rows sharing a timestamp are neither skipped nor duplicated.

Rows can arrive in runs that share one timestamp, and a page can end part-way
through such a run. Nothing in daily-stats writes, so these are not of its
making: ordinary traffic inserts a row per user action, seconds apart, and runs
stay one or two rows long. But `now()` is `transaction_timestamp()`, fixed when
the transaction opens — so anything writing many rows in one transaction
elsewhere (a promo grant, a hand-run backfill, a support batch) leaves every row
it wrote holding the same timestamp, and this read has to page through the block
they form.

Up to 100 such rows the cursor carries their ids. Past that the id list starts
crowding the URL, so it walks the run by `id` (`eq(value)` + `gt(id, …)`)
instead and then steps past it (`gt(value)`). That threshold is deliberately
conservative: overshooting it risks a 414, which is not transient and fails the
report, while undershooting costs one extra request.
These shapes carry the same semantics as the row comparison
`(created_at, id) > (value, lastId)` in
`.agents/skills/supabase-postgres-best-practices/references/data-pagination.md`,
but as plain ANDs. PostgREST cannot express a row comparison directly; the
equivalent `(c > v) OR (c = v AND id > lastId)` needs a second top-level `or=`
param on the three queries that already use `.or()` for their own filters, and
whether PostgREST ANDs repeated `or=` params is not verifiable from here.
Getting that wrong would silently change which rows a revenue report counts, so
the AND form is used instead at the cost of one extra request per long run of
rows.

One guard remains, turning a mis-specified query into an error instead of a
loop: a cursor value that moves backwards, which means the query is not ordered
by the column it pages on.

Fresh activity reports read credit transactions once for all time to supply
lifetime and historical metrics, then slice them in memory for each window.
Cached activity reports refresh only the last 30 days of transactions for
contribution. Add reporting windows as in-memory filters over the shared read.

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

Run `pnpm --filter @sexyvoice/web exec vitest run daily-stats`.
Use read-only queries to investigate actual records. Do not invoke the production
GET handler for verification; it sends the Telegram report.
