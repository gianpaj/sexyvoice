# Gemini 3.8 catalog and samples

## Decision

Add `gpro38` rows with new UUIDs. Existing rows, models, prompts, and previews
remain intact. A replacement migration was rejected because it would change
saved voice selections and break clients requesting the original model.

The shared Gemini helpers send 3.8 style as speech metadata and preserve extended
voice IDs. SDK 2.24.0 exposes these fields. No 2.5 fallback is allowed for 3.8;
the fallback cannot serve extended voice IDs. Streaming remains disabled.

Provider costs use the model that ran and reported token counts. Dated 3.8 rates
apply to dashboard and API usage; historical recovery uses the event date.
Customer credit calculations remain separate from provider dollar accounting.

## Catalog evidence

A read-only Supabase CLI query of project `bfaqdyadcpaetelvpbva` on 2026-09-23
returned 36 TTS rows. The 22 Gemini rows cover 11 identities shared across `gpro`
and `gpro31`. Each identity gets one new `gpro38` entry, preserving the 3.1
owner, visibility, gender, NSFW flag, description, language, and sort order.

The remaining 14 identities belong to Orpheus, xAI, or a cloning provider.
`gemini-38-catalog.json` records each unsupported identity. Substituting a
similar Gemini voice would misrepresent the identity, so these entries are
preserved without a Gemini counterpart.

Google's library returns 33 Mexico-accent voices under `es-419` and 22
Castilian voices under `es-ES`. The selected 17 cover one voice per available
kind in each accent. Mexico has no tech advisor. Provider IDs remain exact;
Mexican product labels use `es-MX`. Catalan is excluded.

## Sample workflow

The generator calls Google directly and saves local MP3s. Routing through the
speech API was rejected because that route publishes audio automatically.
Transcripts and concise delivery instructions are separate. Existing-voice
samples share a warm, non-explicit transcript for comparison. Spanish transcripts
use vocabulary suited to each locale. Provider metadata determines accent and
pitch; delivery prompts do not override them.

Live previews use `https://files.sexyvoice.ai` at the `sv-audio-files` bucket root.
New filenames follow `<provider-name>-gpro38-preview.mp3`. The separate uploader
verifies local hashes and uses conditional puts. Only verified public URLs belong
in executable SQL. The committed SQL draft raises an exception until the final
SQL is regenerated from verified uploads.

See [the script workflow](../../../../scripts/README.md#gemini-38-voice-samples)
for commands and manifest behavior.

## Verification and pending review

Model integration: 313 tests passed, 19 existing skips. Script tests: 62 passed.
`pnpm fixall`, `pnpm type-check`, script linting, and `git diff --check` passed.
All 28 MP3s passed ffprobe checks, with durations from 5.28 to 12 seconds.
Total duration is 248.92 seconds; recorded provider cost is $0.072223.
A resumed generation verified all 28 files without regeneration. The uploader's
28-file dry run performed no network requests.

The user must listen before upload. R2 upload, public URL verification, and final
SQL remain pending. No production catalog rows or storage objects were changed.
