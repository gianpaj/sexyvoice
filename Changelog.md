# Changelog

## 2026-03-13

- Migrated the app to `next-intl`, replacing the legacy dictionary flow
  with locale-aware routing and typed translations. [#230](https://github.com/gianpaj/sexyvoice/pull/230)
- Improved stats reliability by switching daily reporting to burn rate,
  fixing the cron query timeout, and aligning Telegram bot stats output
  with the dashboard. [#287](https://github.com/gianpaj/sexyvoice/pull/287)
  [#288](https://github.com/gianpaj/sexyvoice/pull/288)
  [#289](https://github.com/gianpaj/sexyvoice/pull/289)
- Expanded UX polish with larger hit areas on key controls and a new
  mobile-first multi-column footer. [#290](https://github.com/gianpaj/sexyvoice/pull/290)
  [#295](https://github.com/gianpaj/sexyvoice/pull/295)
- Increased subscription plans by 15% bonus credits.
  [#294](https://github.com/gianpaj/sexyvoice/pull/294)
- Follow-up fixes this week also covered `/api/` locale redirect
  exclusions, `api/health`, build stability, daily stats corrections,
  and PostHog pageview tracking.
