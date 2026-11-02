# Daily stats LiveKit overhead

`apps/web/app/api/daily-stats/overhead-costs.json` stores the $50 monthly
LiveKit subscription and its 2026-11-01 UTC start date. `overhead.ts` includes
the active portion of each reporting window using the existing 12/365 daily
allocation. October estimates keep their invoice baseline; the admin ledger
holds the confirmed October payment.

LiveKit is overhead rather than per-call usage. The subscription is assumed to
cover expected WebRTC participant minutes, so estimating another per-minute
charge would duplicate that cost. Idle days still incur the subscription.

Telegram economics uses two short lines per period: remaining collections and
the collections/usage/overhead breakdown. Missing-cost counts stay visible.
Repeated hosting detail is omitted from the message. The summary uses a single
usage-cost total without paid/free cohorts or a free-coverage ratio; data-quality
alerts and missing-cost counts identify gaps. The feature README documents
allocation and estimate limitations.

Cached activity reports refresh the contribution window's last 30 days of
collections. Fresh reports reuse the all-time transaction read required by
lifetime metrics.

Verification covers the November cutoff, rolling windows and year boundaries,
idle call periods, contribution deductions, invalid baseline
values, and compact output with missing-cost counts.
