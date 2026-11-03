# Retire Gemini 2.5 and 3.1 TTS

## Outcome and scope

Remove the `gpro` and `gpro31` voice catalogs from new speech generation.
Keep `gpro38` as the supported Gemini TTS catalog. Preserve generated audio,
historical voice identities, and historical provider-cost calculations.

The agreed scope covers these provider models:

- `gemini-2.5-flash-preview-tts`
- `gemini-2.5-pro-preview-tts`
- `gemini-3.1-flash-tts-preview`

Google lists November 17, 2026 as their earliest shutdown date. Complete the
removal before that date. See the [deprecation schedule](https://aistudio.google.com/docs/deprecations).
The text LLM in `apps/web/app/api/generate-text/route.ts` uses
`gemini-3.1-flash-lite` and is outside this retirement scope.

Status: runtime implementation is complete. Browser and release checks remain.

## Supabase findings

Read-only inspection of project `bfaqdyadcpaetelvpbva` on November 3, 2026,
at approximately 21:35 UTC found:

| Voice model | Public TTS voices | Referencing audio records |
| ----------- | ----------------: | ------------------------: |
| `gpro`      |                11 |                    29,590 |
| `gpro31`    |                11 |                     9,409 |
| `gpro38`    |                28 |                     9,404 |

Audio counts include soft-deleted records and are grouped by `voice_id`.
They do not measure provider-model usage; a generation can use a fallback.
Both retiring catalogs had generated audio on the inspection date.
Every retiring voice has a `gpro38` entry with the same name, language, and
feature. No characters or call sessions reference either retiring catalog.
Counts are a dated snapshot; repeat the read-only checks before release.

## 1. Remove the catalogs from generation

- [x] Use shared model eligibility logic for dashboard and API catalog queries,
      generation, credit estimation, and voice lookup by name or UUID.
- [x] Exclude `gpro` and `gpro31` from available voices and model catalogs.
- [x] Reject retired voice UUIDs and model aliases before cache access,
      provider requests, or credit charges. Preserve structured API errors.
- [x] Require callers to select a supported voice explicitly. Do not silently
      redirect retired model aliases or UUIDs to Gemini 3.8.
- [x] Check dashboard defaults and history-to-generation actions so they select
      supported voices. Keep existing Gemini 3.8 behavior for free and paid users.

## 2. Delete obsolete runtime paths

- [x] Remove Gemini 2.5 and 3.1 request construction and Flash TTS fallbacks from
      dashboard and external API generation and credit estimation.
- [x] Remove the disabled 3.1 streaming path, its controls, settings, and helpers
      where they have no remaining callers.
- [x] Remove retired-model tag prompts, limits, surcharges, and the `gpro`-only
      free-generation gate. Preserve shared helpers used by supported models.
- [x] Remove retired model aliases from live API schemas, catalogs, and formats.
- [x] Keep the text LLM; remove its TTS tag branches specific to retired models.

## 3. Preserve historical data

- [x] Keep the 22 voice rows and their UUIDs, metadata, and public visibility.
      Audio history joins those rows; voice RLS relies on their visibility.
- [x] Keep audio records, R2 objects, usage events, and credit transactions.
      Do not rewrite historical `voice_id` or provider-model values.
- [x] Retain old model labels and pricing only where historical reporting needs
      them, including `lib/usage-costs.ts` and `lib/api/pricing.ts`.

No database schema change or data migration is required for this approach.
Catalog and request eligibility enforce retirement while history remains readable.

## 4. Update documentation and verify

- [x] Update `ARCHITECTURE.md`, applicable repository guidance, public API docs,
      and examples to list supported generation models.
- [x] Regenerate the docs app's OpenAPI output after updating API schemas.
- [x] Update affected localized labels and run `pnpm check-translations` when
      message files change. Keep the existing UI layout.
- [x] Cover retired models by name and UUID, credit estimation, cached requests,
      catalog filtering, and rejection without charging or provider calls.
- [ ] Verify signed-in history playback and downloads. Read-only history-name
      joins, R2 availability, and provider-cost recovery checks pass.
- [x] Verify Gemini 3.8 generation and estimates for free and paid users, plus
      unaffected Grok and Replicate generation.
- [x] Update the relevant unit tests, Playwright coverage, and E2E test plan.
      Run `pnpm fixall`, `pnpm type-check`, `pnpm test`, and translation parity.
- [ ] Run the generate and history Playwright specs with test credentials. The
      focused catalog attempt stops in authentication setup because the test
      email and password are absent.

## Verification evidence

The full suite passes 2,003 web tests and 131 script tests. Formatting, type
checks, translation parity, and `git diff --check` pass. The docs generator
accepts a local schema path; generation from the branch schema succeeds.

Read-only checks at 2026-11-03 22:32 UTC returned 35 public voices with the
retirement filter and confirmed all 22 retired rows remain public. One active
historical audio row per retired catalog resolved its original voice name and
returned HTTP 200 from R2. No database or storage writes ran.

See the [implementation note](../.agents/notes/proposed/tts/2026-11-03-gemini-tts-retirement.md)
for decisions and verification limits.

## Release verification

Confirm dashboard and API catalogs omit both aliases, direct retired requests
fail before generation or charging, and history remains usable. Check telemetry
for retired provider requests after existing in-flight requests finish.
