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

## Sample workflow

Generate MP3s locally and write a manifest. The user listens before invoking a
separate R2 uploader. Preserve the established bucket-folder and filename
conventions after verifying live catalog URLs. Uploads must not overwrite
existing previews. Only verified public URLs belong in insertion SQL.

## Open evidence

Supabase CLI authentication is unavailable. The live voice inventory, ownership,
and R2 sample path convention remain unverified. Do not guess these values.
Google's library returns 33 Mexico-accent voices under `es-419` and 22
Castilian voices under `es-ES`. Mexico has eight of the nine requested kinds;
there is no Mexican tech advisor in this listing. Select one per available
kind and preserve the provider IDs. Use `es-MX` as the product locale while
recording the original provider locale separately.

## Verification

Model integration: 313 tests passed, 19 existing skips. `pnpm fixall` and
`pnpm type-check` passed. Catalog generation and upload validation are pending.
