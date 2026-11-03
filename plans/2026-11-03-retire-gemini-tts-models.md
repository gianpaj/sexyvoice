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

Status: proposed implementation; database inspection is complete.

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

- [ ] Use shared model eligibility logic for dashboard and API catalog queries,
      generation, credit estimation, and voice lookup by name or UUID.
- [ ] Exclude `gpro` and `gpro31` from available voices and model catalogs.
- [ ] Reject retired voice UUIDs and model aliases before cache access,
      provider requests, or credit charges. Preserve structured API errors.
- [ ] Require callers to select a supported voice explicitly. Do not silently
      redirect retired model aliases or UUIDs to Gemini 3.8.
- [ ] Check dashboard defaults and history-to-generation actions so they select
      supported voices. Keep existing Gemini 3.8 behavior for free and paid users.

## 2. Delete obsolete runtime paths

- [ ] Remove Gemini 2.5 and 3.1 request construction and Flash TTS fallbacks from
      dashboard and external API generation and credit estimation.
- [ ] Remove the disabled 3.1 streaming path, its controls, settings, and helpers
      where they have no remaining callers.
- [ ] Remove retired-model tag prompts, limits, surcharges, and the `gpro`-only
      free-generation gate. Preserve shared helpers used by supported models.
- [ ] Remove retired model aliases from live API schemas, catalogs, and formats.
- [ ] Keep the text LLM; remove its TTS tag branches specific to retired models.

## 3. Preserve historical data

- [ ] Keep the 22 voice rows and their UUIDs, metadata, and public visibility.
      Audio history joins those rows; voice RLS relies on their visibility.
- [ ] Keep audio records, R2 objects, usage events, and credit transactions.
      Do not rewrite historical `voice_id` or provider-model values.
- [ ] Retain old model labels and pricing only where historical reporting needs
      them, including `lib/usage-costs.ts` and `lib/api/pricing.ts`.

No database schema change or data migration is required for this approach.
Catalog and request eligibility enforce retirement while history remains readable.

## 4. Update documentation and verify

- [ ] Update `ARCHITECTURE.md`, applicable repository guidance, public API docs,
      and examples to list supported generation models.
- [ ] Regenerate the docs app's OpenAPI output after updating API schemas.
- [ ] Update affected localized labels and run `pnpm check-translations` when
      message files change. Keep the existing UI layout.
- [ ] Cover retired models by name and UUID, credit estimation, cached requests,
      catalog filtering, and rejection without charging or provider calls.
- [ ] Verify history names, playback, downloads, and provider-cost recovery.
- [ ] Verify Gemini 3.8 generation and estimates for free and paid users, plus
      unaffected Grok and Replicate generation.
- [ ] Update the relevant unit tests, Playwright coverage, and E2E test plan.
      Run `pnpm fixall`, `pnpm type-check`, `pnpm test`, and focused Playwright tests.

## Release verification

Confirm dashboard and API catalogs omit both aliases, direct retired requests
fail before generation or charging, and history remains usable. Check telemetry
for retired provider requests after existing in-flight requests finish.
