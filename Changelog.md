# Changelog

Completed releases are documented here in reverse chronological order.

## [2026.9.27] - 2026-09-27

### Added

#### Voice generation

- Added Gemini 3.8 Flash TTS voices to the Generate page: the eleven
  existing Gemini voices (`achernar`, `aoede`, `autonoe`, `callirrhoe`,
  `despina`, `erinome`, `gacrux`, `kore`, `puck`, `sulafat`, and
  `zephyr`) on the new model, plus 17 Spanish voices with Castilian
  (`es-ES`) and Mexican (`es-MX`) accents shown under names such as
  Clara, Hugo, Mariana, and Diego.
  [#590](https://github.com/gianpaj/sexyvoice/pull/590)
- Gemini 3.8 voices send your style instructions as delivery direction
  separate from the spoken text, and accept inline vocal tags such as
  `<sigh>`, `<laughter>`, and `<short pause>` in any transcript
  language. [#590](https://github.com/gianpaj/sexyvoice/pull/590)
- Gemini 3.8 voices are listed first in the voice picker. Free accounts
  pay the base Gemini credit rate for them, with no free-tier surcharge.
  [#590](https://github.com/gianpaj/sexyvoice/pull/590)

#### External API

- `POST /api/v1/speech` accepts `model: "gpro38"` for Gemini 3.8 Flash
  TTS voices. Send spoken words in `input` and delivery instructions in
  `style`; `temperature` is supported. Responses are WAV and report
  `gemini-3.8-flash-tts` in `usage.model`.
  [#590](https://github.com/gianpaj/sexyvoice/pull/590)
- `GET /api/v1/voices` and `GET /api/v1/models` include `gpro38`
  entries, and `gpro38` voices report `supports_style: true`.
  [#590](https://github.com/gianpaj/sexyvoice/pull/590)

### Changed

#### External API

- Voice and model mismatches on `POST /api/v1/speech` return HTTP
  `404` with `voice_not_found` instead of HTTP `400` with
  `model_not_found`. Clients that handled `model_not_found` should also
  handle `voice_not_found`.
  [#590](https://github.com/gianpaj/sexyvoice/pull/590)

#### Voice generation

- Voice preview buttons animate while a sample plays.
  [#593](https://github.com/gianpaj/sexyvoice/pull/593)

### Fixed

#### Voice generation

- Credit balances refresh after generation and insufficient-credit errors.
  Cancelled generations report any retained charge.
  [#589](https://github.com/gianpaj/sexyvoice/pull/589)

## [2026.4.7] - 2026-04-07

### Added

#### External API

- `GET /api/v1/voices` now returns a `supports_style` flag so you can
  detect whether a voice accepts the freeform `style` parameter.

### Fixed

#### External API

- `POST /api/v1/speech` now ignores `style` for non-Gemini voices when
  validating input length and charging credits, so Grok and Orpheus
  requests use the raw `input` text instead of a prefixed style prompt.

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
