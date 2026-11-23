// Release entries shown in the dashboard sidebar's changelog panel.
// Mirrors the release log in `Changelog.md` at the repository root:
// add an entry here (and keep reverse chronological order) whenever a new
// release section is added there. `tests/changelog.test.ts` checks that this
// file covers every release documented in `Changelog.md`.

export type ChangelogChangeType = 'added' | 'changed' | 'fixed';

export interface ChangelogEntry {
  /**
   * Feature area from the changelog subheading, e.g. "Voice generation" or
   * "External API".
   */
  area: string;
  /** PR numbers that shipped the change, linked in the panel. */
  prs?: number[];
  /** User-facing description, kept close to the `Changelog.md` wording. */
  text: string;
  type: ChangelogChangeType;
}

export interface ChangelogRelease {
  /** ISO 8601 release date, e.g. "2026-09-27". */
  date: string;
  /** Entries in the order they appear under the release in `Changelog.md`. */
  entries: ChangelogEntry[];
  /** Release version matching `apps/web/package.json` at release time. */
  version: string;
}

export const changelogReleases: ChangelogRelease[] = [
  {
    date: '2026-09-27',
    entries: [
      {
        area: 'Voice generation',
        prs: [590],
        text: 'Added Gemini 3.8 Flash TTS voices to the Generate page: the eleven existing Gemini voices (achernar, aoede, autonoe, callirrhoe, despina, erinome, gacrux, kore, puck, sulafat, and zephyr) on the new model, plus 17 Spanish voices with Castilian (es-ES) and Mexican (es-MX) accents shown under names such as Clara, Hugo, Mariana, and Diego.',
        type: 'added',
      },
      {
        area: 'Voice generation',
        prs: [590],
        text: 'Gemini 3.8 voices send your style instructions as delivery direction separate from the spoken text, and accept inline vocal tags such as <sigh>, <laughter>, and <short pause> in any transcript language.',
        type: 'added',
      },
      {
        area: 'Voice generation',
        prs: [590],
        text: 'Gemini 3.8 voices are listed first in the voice picker. Free accounts pay the base Gemini credit rate for them, with no free-tier surcharge.',
        type: 'added',
      },
      {
        area: 'External API',
        prs: [590],
        text: 'POST /api/v1/speech accepts model "gpro38" for Gemini 3.8 Flash TTS voices. Send spoken words in input and delivery instructions in style; temperature is supported. Responses are WAV and report gemini-3.8-flash-tts in usage.model.',
        type: 'added',
      },
      {
        area: 'External API',
        prs: [590],
        text: 'GET /api/v1/voices and GET /api/v1/models include gpro38 entries, and gpro38 voices report supports_style: true.',
        type: 'added',
      },
      {
        area: 'External API',
        prs: [590],
        text: 'Voice and model mismatches on POST /api/v1/speech return HTTP 404 with voice_not_found instead of HTTP 400 with model_not_found. Clients that handled model_not_found should also handle voice_not_found.',
        type: 'changed',
      },
      {
        area: 'Voice generation',
        prs: [593],
        text: 'Voice preview buttons animate while a sample plays.',
        type: 'changed',
      },
      {
        area: 'Voice generation',
        prs: [589],
        text: 'Credit balances refresh after generation and insufficient-credit errors. Cancelled generations report any retained charge.',
        type: 'fixed',
      },
    ],
    version: '2026.9.27',
  },
  {
    date: '2026-04-07',
    entries: [
      {
        area: 'External API',
        text: 'GET /api/v1/voices now returns a supports_style flag so you can detect whether a voice accepts the freeform style parameter.',
        type: 'added',
      },
      {
        area: 'External API',
        text: 'POST /api/v1/speech now ignores style for non-Gemini voices when validating input length and charging credits, so Grok and Orpheus requests use the raw input text instead of a prefixed style prompt.',
        type: 'fixed',
      },
    ],
    version: '2026.4.7',
  },
  {
    date: '2026-04-03',
    entries: [
      {
        area: 'Internal',
        prs: [325],
        text: 'Added a localized blog index with a promo banner and latest posts grid.',
        type: 'added',
      },
      {
        area: 'Internal',
        text: 'Added the voice cloning pricing FAQ to all supported locale files.',
        type: 'added',
      },
      {
        area: 'Cloning',
        prs: [329],
        text: 'Migrated voice cloning from fal.ai to Voxtral and expanded multilingual cloning support.',
        type: 'changed',
      },
      {
        area: 'Internal',
        prs: [327],
        text: 'Improved blog index SEO metadata and increased gpro voice generation pricing by 10%.',
        type: 'changed',
      },
      {
        area: 'Cloning',
        prs: [329],
        text: 'Corrected OGG voice uploads so valid files keep their detected duration during voice cloning.',
        type: 'fixed',
      },
      {
        area: 'Cloning',
        text: 'Restored hosted clone images from images.sexyvoice.ai so sample artwork loads correctly again.',
        type: 'fixed',
      },
      {
        area: 'Internal',
        text: 'Fixed the reset-password flow and refreshed the success state in the reset-password form.',
        type: 'fixed',
      },
      {
        area: 'Internal',
        text: 'Account deletion now also removes custom call characters, linked prompts, API keys, and usage events.',
        type: 'fixed',
      },
    ],
    version: '2026.4.3',
  },
  {
    date: '2026-03-13',
    entries: [
      {
        area: 'Internal',
        prs: [287, 289],
        text: "Switched daily stats reporting to burn rate and aligned Telegram bot stats output with the dashboard's daily stats data.",
        type: 'changed',
      },
      {
        area: 'Internal',
        prs: [230],
        text: 'Migrated the app to next-intl, replacing the legacy dictionary flow with locale-aware routing and typed translations.',
        type: 'changed',
      },
      {
        area: 'Internal',
        prs: [290, 295],
        text: 'Expanded key tap targets and redesigned the footer with a mobile-first multi-column layout.',
        type: 'changed',
      },
      {
        area: 'Internal',
        prs: [294],
        text: 'Increased subscription plan bonus credits by 15%.',
        type: 'changed',
      },
      {
        area: 'Internal',
        prs: [288],
        text: 'Resolved the daily-stats cron query timeout.',
        type: 'fixed',
      },
      {
        area: 'Internal',
        text: 'Stopped locale-prefix redirects from affecting /api/ routes.',
        type: 'fixed',
      },
      {
        area: 'Internal',
        text: 'Restored /api/health and build stability after the i18n migration.',
        type: 'fixed',
      },
      {
        area: 'Internal',
        text: 'Corrected daily stats revenue and planned audio file count reporting.',
        type: 'fixed',
      },
      {
        area: 'Internal',
        text: 'Set PostHog capture_pageview back to the expected default behavior.',
        type: 'fixed',
      },
    ],
    version: '2026.3.13',
  },
];
