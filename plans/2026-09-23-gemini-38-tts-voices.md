# Add Gemini 3.8 TTS voices

## Outcome

Add Gemini 3.8 versions of all existing voices as new catalog entries.
Add a representative selection of Spanish voices covering Mexican Spanish
and Spanish from Spain. Exclude Catalan voices from the additions.
Generate a fresh sample for every new entry using `gemini-3.8-flash-tts`.

## Branch and status

Use `feat/gemini-38-voice-catalog`, created from `main` in a clean worktree.
Model integration and provider-cost tracking are implemented and tested.
The 28-entry catalog, local generator, and separate uploader are implemented.
All 28 MP3s are ready for listening. Upload and final SQL await that review.
The earlier implementation remains separate on `feat/gemini-38-tts`.
Its replacement SQL does not satisfy this additive catalog plan.

## Catalog rules

- Create new UUIDs for the Gemini 3.8 entries with model alias `gpro38`.
- Insert all new rows with `is_public = false` for the initial rollout.
- Preserve all existing rows, model assignments, UUIDs, prompts, and sample URLs.
- Include every existing voice identity in the inventory and coverage report.
- Verify provider voice IDs against Gemini 3.8 before preparing each new entry.
- Flag unsupported provider-specific voices rather than silently omitting them.
- Deduplicate identities shared by existing model versions within the new catalog.
- Select Spanish additions from `es-MX` and `es-ES`; do not select `ca` voices.
- Use one representative per kind, following the original selection request.
- Confirm Mexican candidates from Google's voice list; the supplied table has
  Spain Spanish entries only. Mexican voices use provider locale `es-419` with
  accent `Mexico Spanish`; preserve their IDs and label the product locale `es-MX`.

## 1. Inspect the catalogs

- [x] Authenticate the Supabase CLI and confirm the intended project.
- [x] Query all existing TTS voices using read-only Supabase CLI commands.
- [x] Export IDs, provider names, models, owners, language, descriptions, and samples.
- [x] Inspect existing sample URLs to identify the R2 bucket, folder structure,
      filename format, and public URL convention.
- [x] Confirm public/private scope and account for every existing voice.
- [x] Check Gemini 3.8 support for each distinct provider voice identity.
- [x] Inspect the Mexican Spanish and Spain Spanish provider voice lists.
- [x] Record the final additions, their kinds, accents, genders, and pitches.

## 2. Support Gemini 3.8 generation

- [x] Add `gpro38` to model selection, API schemas, catalogs, and voice labels.
- [x] Verify the Google Gen AI SDK version required for the speech fields.
- [x] Share request construction across the dashboard, API, and sample script.
- [x] Keep spoken text separate from delivery instructions in speech metadata.
- [x] Preserve extended provider voice IDs exactly.
- [x] Handle complete WAV responses without adding another WAV header.
- [x] Include delivery instructions in dashboard cache keys.
- [x] Avoid fallback models that cannot serve the selected voice.
- [x] Keep existing model routes and voice selections working.

## 3. Record usage and provider costs

- [x] Verify Google's published standard-tier Gemini 3.8 TTS rates.
- [x] Track the actual provider model and input/output token counts in both routes.
- [x] Apply effective dates to provider pricing and historical cost recovery.
- [x] Preserve historical pricing for other models.
- [x] Keep customer credit charging separate from provider dollar costs.
- [x] Test credit estimates, successful usage records, and refunds on failure.

## 4. Prepare SQL and samples

- [x] Write repeatable insertion SQL for the new `gpro38` entries.
- [x] Derive ownership and metadata conventions from the verified catalog.
- [x] Guard against duplicate `gpro38` entries when the SQL is rerun.
- [x] Write improved sample transcripts and concise delivery instructions.
- [x] Use Mexican Spanish prompts for `es-MX` and Spain Spanish for `es-ES`.
- [x] Generate new 3.8 samples for every existing voice identity and Spanish addition.
- [x] Save a manifest linking provider IDs, proposed catalog entries, prompts,
      generated files, token usage, and provider costs.
- [x] Keep generation local; do not upload as part of generation.
- [ ] Have the user listen to the MP3s before uploading. Regenerate rejected
      samples and let the user review their replacements.

## 5. Upload reviewed samples to Cloudflare R2

Use a separate upload script so generation, listening, and publishing are
explicit steps. The script accepts a local directory, destination bucket, and
bucket folder. Run it only for files the user has reviewed and selected.

- [x] Reuse the repository's R2 client and credential conventions.
- [x] Use the manifest to map each selected MP3 to its voice and destination key.
- [x] Match the path and filename format found in existing database sample URLs.
      Use distinct keys for the new 3.8 samples so existing previews remain intact.
- [x] Add `--dry-run` to show local files, destination keys, and public URLs
      without uploading or changing the database.
- [x] Refuse overwrites by default and detect duplicate destination keys.
- [ ] Upload only the reviewed MP3s with the correct audio content type.
- [x] Record successful uploads and public URLs in an upload manifest. Report
      failures separately so an incomplete batch cannot appear ready for SQL.
- [ ] Verify the uploaded objects and public URLs before preparing the final SQL.
- [ ] Populate new catalog entries' `sample_url` values from verified uploads.

## 6. Validate and hand off

- [x] Compare expected additions with generated samples and SQL rows.
- [x] Verify that the additions include both Spanish locales and no Catalan voices.
- [x] Verify that SQL does not update or delete any existing voice row.
- [x] Test new and existing speech routes, pricing, WAV handling, and cache isolation.
- [x] Test upload dry runs, filename mapping, overwrite refusal, and partial failures.
- [x] Run `pnpm fixall`, `pnpm type-check`, affected tests, and `git diff --check`.
- [x] Update API documentation and regenerate OpenAPI pages.
- [ ] Deliver reviewed SQL, generation and upload manifests, and deployment instructions.

## Deployment

Generate MP3s locally, let the user listen, then explicitly run the separate
uploader for the selected files. Deploy `gpro38` support before inserting its
catalog entries. Use verified R2 public URLs in the new rows. Neither script
executes catalog SQL. Existing voice selections keep
using their existing models. Users can select the additional Gemini 3.8 entries.

Prepare database writes for the user to execute under the repository's
[database rules](../AGENTS.md#mandatory-rules).

## Completion criteria

Every intended existing voice has a verified Gemini 3.8 counterpart with a fresh
sample. The additional Spanish selection covers Mexico and Spain, with no Catalan
additions. Existing catalog rows remain intact. Both speech routes record correct
provider usage and costs. The user has listened to the selected samples, their R2
paths follow the existing catalog conventions, and their public URLs are verified.
SQL and both manifests are reconciled and required checks pass.
