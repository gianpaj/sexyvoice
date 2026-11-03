# Gemini TTS retirement

## Decision

Retire the `gpro` and `gpro31` catalogs in application code. Keep `gpro38`
available on both tiers. The [approved plan](../../../../plans/2026-11-03-retire-gemini-tts-models.md)
covers generation, estimates, catalogs, and obsolete streaming code.

Keep historical voice rows public because audio history joins their UUIDs and
voice RLS checks public visibility. Deleting rows, making them private, and
remapping their UUIDs are rejected because they would damage history or change
the selected voice. This work requires no database writes or migrations.

Use one retirement rule in catalog filters and request validation. Reject
retired aliases and UUIDs before cache reads, credit reservations, or provider
calls. Require callers to select a supported voice explicitly.

Historical provider prices and labels remain available for reporting.
Generation uses Gemini 3.8 without a fallback to a retired model.

## Implementation

`lib/tts/models.ts` supplies the query filter and request predicate. Session and
admin lookups return `null` for unavailable voices; dashboard and API requests
return `404`. API schema validation rejects retired aliases with `400`.
The dashboard filters its props before choosing a default voice.

Gemini requests use 3.8 on either tier. The 2.5 fallback, 3.1 streaming route,
streaming player, combined token budget, free-generation gate, and 3.1 surcharge
are removed. Persisted generation settings retain seed, speed, and temperature.

The docs generator accepts a local schema path so branch validation uses the
branch's API contract while generated pages keep their published schema ID.

## Verification

Formatting, type checks, and translation parity pass. The full suite passes
2,003 web tests and 131 script tests. Catalog tests cover retired aliases and
UUIDs, cache rejection, charging, and selection of a supported default. Gemini
3.8 tests exercise free and paid users; historical pricing tests remain green.

Read-only Supabase and R2 checks at 2026-11-03 22:32 UTC returned 35 available
public voices after filtering and confirmed all 22 retired rows remain public.
One active historical audio row from each retired catalog resolved its original
voice name and returned HTTP 200 from R2. No database or storage writes ran.

The focused Playwright attempt stopped in authentication setup because
`PLAYWRIGHT_TEST_USER_EMAIL` and `PLAYWRIGHT_TEST_USER_PASSWORD` are absent.
Run the new catalog test and the generate/history specs with those credentials
before release. Deployment and production telemetry checks remain release work.
