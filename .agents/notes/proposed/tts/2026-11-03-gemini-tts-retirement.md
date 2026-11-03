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

## Verification

Pending implementation. Check rejection by alias and UUID, supported providers
on free and paid tiers, history reads, provider-cost recovery, and the dashboard
voice picker. Run formatting, type checks, unit tests, and focused Playwright
coverage before completing the plan.
