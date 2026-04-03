# Changelog

Completed releases are documented here in reverse chronological order.

## [2026.4.3] - 2026-04-03

### Added

#### Internal

- Added a localized blog index with a promo banner and latest posts
  grid. [#325](https://github.com/gianpaj/sexyvoice/pull/325)
- Added the voice cloning pricing FAQ to all supported locale files.

### Changed

#### Cloning

- Migrated voice cloning from fal.ai to Voxtral and expanded
  multilingual cloning support.
  [#329](https://github.com/gianpaj/sexyvoice/pull/329)

#### Internal

- Improved blog index SEO metadata and increased `gpro` voice
  generation pricing by 10%.
  [#327](https://github.com/gianpaj/sexyvoice/pull/327)

### Fixed

#### Cloning

- Corrected OGG voice uploads so valid files keep their detected
  duration during voice cloning.
  [#329](https://github.com/gianpaj/sexyvoice/pull/329)
- Restored hosted clone images from `images.sexyvoice.ai` so sample
  artwork loads correctly again.

#### Internal

- Fixed the reset-password flow and refreshed the success state in the
  reset-password form.
- Account deletion now also removes custom call characters, linked
  prompts, API keys, and usage events.

## [2026.3.13] - 2026-03-13

### Changed

#### Internal

- Switched daily stats reporting to burn rate and aligned Telegram bot
  stats output with the dashboard's daily stats data.
  [#287](https://github.com/gianpaj/sexyvoice/pull/287)
  [#289](https://github.com/gianpaj/sexyvoice/pull/289)

- Migrated the app to `next-intl`, replacing the legacy dictionary flow
  with locale-aware routing and typed translations.
  [#230](https://github.com/gianpaj/sexyvoice/pull/230)
- Expanded key tap targets and redesigned the footer with a
  mobile-first multi-column layout.
  [#290](https://github.com/gianpaj/sexyvoice/pull/290)
  [#295](https://github.com/gianpaj/sexyvoice/pull/295)
- Increased subscription plan bonus credits by 15%.
  [#294](https://github.com/gianpaj/sexyvoice/pull/294)

### Fixed

#### Internal

- Resolved the daily-stats cron query timeout.
  [#288](https://github.com/gianpaj/sexyvoice/pull/288)
- Stopped locale-prefix redirects from affecting `/api/` routes.
- Restored `/api/health` and build stability after the i18n migration.
- Corrected daily stats revenue and planned audio file count reporting.
- Set PostHog `capture_pageview` back to the expected default behavior.
