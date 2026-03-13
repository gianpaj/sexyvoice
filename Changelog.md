# Changelog

Completed releases are documented here in reverse chronological order.

## [2026.3.13] - 2026-03-13

### Changed

- Migrated the app to `next-intl`, replacing the legacy dictionary flow
  with locale-aware routing and typed translations.
  [#230](https://github.com/gianpaj/sexyvoice/pull/230)
- Switched daily stats reporting to burn rate and aligned Telegram bot
  stats output with the dashboard's daily stats data.
  [#287](https://github.com/gianpaj/sexyvoice/pull/287)
  [#289](https://github.com/gianpaj/sexyvoice/pull/289)
- Expanded key tap targets and redesigned the footer with a
  mobile-first multi-column layout.
  [#290](https://github.com/gianpaj/sexyvoice/pull/290)
  [#295](https://github.com/gianpaj/sexyvoice/pull/295)
- Increased subscription plan bonus credits by 15%.
  [#294](https://github.com/gianpaj/sexyvoice/pull/294)

### Fixed

- Resolved the daily-stats cron query timeout.
  [#288](https://github.com/gianpaj/sexyvoice/pull/288)
- Stopped locale-prefix redirects from affecting `/api/` routes.
- Restored `/api/health` and build stability after the i18n migration.
- Corrected daily stats revenue and planned audio file count reporting.
- Set PostHog `capture_pageview` back to the expected default behavior.
