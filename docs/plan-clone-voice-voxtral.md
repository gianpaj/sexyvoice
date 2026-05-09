# Clone Voice Migration Plan: Mistral Voxtral

## Goal

Migrate `POST /api/clone-voice` to use Mistral Voxtral zero-shot voice cloning for the languages Voxtral supports, while preserving the existing clone flow, storage of generated outputs, caching, credits, analytics, and DB persistence.

## Scope

### In scope

- Use Mistral Voxtral for these locales:
  - `en`
  - `fr`
  - `es`
  - `pt`
  - `it`
  - `nl`
  - `de`
  - `hi`
  - `ar`
- Do not upload reference audio to R2
- Keep generated output upload to R2
- Keep cache behavior for generated outputs
- Keep credit deduction and usage tracking
- Save `voxtral-mini-tts-2603` as `modelUsed` in `runBackgroundTasks()`
- Update route tests to reflect the new provider behavior
- Update the clone frontend so Voxtral-supported locales show the correct provider-specific guidance and validation hints
- Add/update environment variable documentation as part of implementation

### Out of scope

- Reworking the entire voice cloning product UI beyond the clone page guidance and validation alignment needed for the provider migration
- Adding advanced audio quality checks like speaker diarization or background noise detection
- Removing Replicate fallback for unsupported locales unless explicitly done in a later step
- Changing the external API `/api/v1/*`

---

## Product and API decision

### Provider routing

Use Mistral Voxtral for supported locales only:

- `en`
- `fr`
- `es`
- `pt`
- `it`
- `nl`
- `de`
- `hi`
- `ar`

For all other currently supported clone locales, keep the existing fallback provider path for now.

### Voxtral model

Use:

- `voxtral-mini-tts-2603`

This exact string must be persisted as `modelUsed` for DB save and usage tracking.

---

## Key behavior changes

## 1. Reference audio must not be uploaded to R2

Current flow uploads processed reference audio to R2 and uses the resulting URL for provider inference.

New flow:

- process and normalize the uploaded reference audio in-memory
- compute a deterministic content hash from the processed buffer
- use the processed buffer directly as base64 `ref_audio` for Mistral
- do not upload the reference audio to R2
- do not cache reference audio URLs in Redis

### Why

- Mistral accepts `ref_audio` as base64
- uploading reference audio is unnecessary for inference
- this reduces storage churn and avoids persisting user reference samples unnecessarily

---

## 2. Duration validation must become provider-aware

Current clone route uses one global duration rule:

- min: 10 seconds
- max: 5 minutes

Voxtral zero-shot requirements are:

- min: 3 seconds
- max: 25 seconds

### New rule

For Voxtral-supported locales:

- enforce `3 <= duration <= 25`

For fallback locales:

- keep the existing duration rule unless intentionally changed later

### User-facing error message

For Voxtral locales, use a specific message such as:

- `Reference audio must be between 3 and 25 seconds for voice cloning.`

This is clearer than the current generic 10s–5min message.

## 2b. Frontend guidance and client-side validation must also become provider-aware

The clone page currently exposes a shared locale list and generic upload/recording guidance. Because Voxtral-supported locales now have different constraints from fallback locales, the frontend must mirror the backend rules closely enough to avoid confusing users.

### New frontend rule

For Voxtral-supported locales:

- show provider-specific upload guidance
- show the `3 <= duration <= 25` requirement in user-facing copy
- prefer client-side validation or pre-submit checks that match backend expectations where feasible

For fallback locales:

- preserve the current locale availability
- keep existing fallback guidance unless intentionally changed later

### Minimum frontend changes

On `app/[lang]/(dashboard)/dashboard/clone/new.client.tsx`:

- add a client-side helper or constant for Voxtral-supported locales
- use it to drive provider-aware UI hints and duration messaging
- keep the full supported locale list, because unsupported Voxtral locales still use the fallback backend provider

### Why

- prevents users from seeing stale 10s–5min expectations for Voxtral locales
- reduces avoidable backend validation failures
- keeps frontend behavior aligned with backend provider routing

---

## 3. Reference audio format should be normalized before sending to Mistral

Recommendation:

- send WAV base64 to Mistral whenever conversion is possible

### Why

- more deterministic than passing through mixed codecs
- avoids provider-side codec ambiguity
- aligns with existing server-side conversion logic

### Practical rule

- if uploaded audio is already WAV, use it directly
- if uploaded audio is supported and needs conversion, convert to WAV
- if conversion fails, return a clear 500/validation error as today

---

## 4. Generated output remains uploaded to R2

Only the reference audio upload is removed.

Generated output should still:

- be uploaded to R2
- be cached in Redis by deterministic output filename
- be saved in Supabase
- be tracked in usage events and PostHog

---

## Architecture changes

## A. Introduce provider resolution

Add a helper to resolve which clone provider to use from locale.

### Proposed behavior

- normalize locale if needed
- if locale is in Voxtral-supported set → `mistral`
- otherwise → existing fallback provider

### Suggested helper names

- `isVoxtralCloneLocale(locale: string): boolean`
- `resolveCloneProvider(locale: string): 'mistral' | 'replicate'`

---

## B. Introduce provider-specific constraints

Add a helper or config object for clone provider constraints.

### Suggested shape

- `mistral`
  - `minDurationSeconds: 3`
  - `maxDurationSeconds: 25`
- `replicate`
  - `minDurationSeconds: 10`
  - `maxDurationSeconds: 300`

### Suggested helper names

- `getCloneProviderConstraints(provider)`
- `validateAudioDurationForProvider(duration, provider)`

---

## C. Refactor audio processing responsibilities

Current `processAudioFile()` both:

- normalizes/converts audio
- validates duration

That makes provider-specific validation awkward.

### Proposed change

`processAudioFile()` should:

- read file
- normalize MIME type
- convert to WAV if needed
- compute duration
- return `{ buffer, mimeType, duration, audioHash }`

The route should then:

- resolve provider
- validate duration using provider constraints

This keeps responsibilities cleaner.

---

## D. Add Mistral provider function

Create a dedicated provider function for Voxtral.

### Suggested signature

- `generateVoiceWithMistral(text, referenceAudioBuffer, mimeType, signal?)`

### Responsibilities

- base64 encode processed reference audio
- call Mistral `/v1/audio/speech`
- request `response_format: 'wav'`
- decode returned `audio_data`
- return:
  - generated audio buffer
  - `modelUsed: 'voxtral-mini-tts-2603'`
  - request ID if available, otherwise a generated fallback ID

### Notes

- if using the official SDK, ensure Node 24 compatibility
- if using direct HTTP, capture response headers if a request ID is exposed
- if no provider request ID is available, generate an internal fallback request ID for persistence

---

## E. Remove reference-audio URL assumptions from route internals

Current route and helper names assume a reference audio URL exists.

These should be renamed or neutralized where practical.

### Examples

- `audioReferenceUrl` → `referenceAudioBuffer` or remove entirely
- `uploadReferenceAudio()` → remove
- cache key generation should use:
  - locale
  - text
  - processed audio hash

### Important

The output cache key must remain deterministic even without R2 reference upload.

Recommended cache key input:

- `${locale}-${text}-${audioHash}`

where `audioHash` is computed from the processed reference audio buffer.

---

## Implementation plan

## Step 1 — Add this plan doc
Create `docs/plan-clone-voice-voxtral.md`.

## Step 2 — Add provider constants and routing helpers
In `app/api/clone-voice/route.ts`:

- add Voxtral-supported locale set
- add provider resolution helper
- add provider-specific duration constraints helper

## Step 3 — Refactor duration validation
- replace global `validateAudioDuration()` usage with provider-aware validation
- keep `getAudioDuration()` as the duration extraction helper
- update error messages for Voxtral locales

## Step 4 — Refactor audio processing
- make `processAudioFile()` return processed buffer, MIME type, duration, and audio hash
- remove reference-audio upload dependency from the route

## Step 5 — Add Mistral integration
- add Mistral client or direct HTTP integration
- implement `generateVoiceWithMistral()`
- request:
  - `model: 'voxtral-mini-tts-2603'`
  - `input: text`
  - `ref_audio` as base64
  - `response_format: 'wav'`

## Step 6 — Route supported locales to Mistral
- use Mistral for:
  - `en`, `fr`, `es`, `pt`, `it`, `nl`, `de`, `hi`, `ar`
- keep fallback provider for unsupported locales

## Step 7 — Remove reference audio upload logic
- delete or stop calling `uploadReferenceAudio()`
- remove Redis reference-audio cache usage
- ensure no R2 upload occurs for reference samples

## Step 8 — Preserve generated output flow
- keep output upload to R2
- keep output Redis cache
- keep DB save and usage event flow

## Step 9 — Ensure `modelUsed` is persisted correctly
For Mistral-generated clones, `runBackgroundTasks()` must receive:

- `modelUsed: 'voxtral-mini-tts-2603'`

## Step 10 — Update tests
Update `tests/clone-voice.test.ts`, shared mocks, and frontend checks as needed to cover:

- Mistral success path for supported locales
- no reference audio upload to R2
- generated output still uploaded
- `modelUsed` saved as `voxtral-mini-tts-2603`
- Voxtral duration validation:
  - reject `< 3s`
  - reject `> 25s`
  - accept valid duration in range
- fallback provider still used for unsupported Voxtral locales
- cache behavior still works without reference-audio upload

## Step 11 — Update frontend clone page
Update `app/[lang]/(dashboard)/dashboard/clone/new.client.tsx` to align with backend behavior:

- keep the full locale list because fallback locales remain supported
- add a Voxtral-supported locale set/helper
- show provider-aware guidance for Voxtral locales
- reflect the 3–25 second reference-audio rule in user-facing copy
- avoid stale UI assumptions about the old reference audio requirements

## Step 12 — Update environment variable docs
If adding `MISTRAL_API_KEY` or related env vars, update in the same change:

- `AGENTS.md`
- `README.md`
- `.env.example`
- `docs/devops.md`

## Step 13 — Run tests and quality checks
At minimum:

- route test file
- any new provider-specific tests
- type-check if needed

---

## Testing strategy

## Unit/integration tests to add or update

### Validation
- supported Voxtral locale uses 3–25s rule
- unsupported Voxtral locale still uses fallback rule
- missing duration still returns 400
- valid OGG/WAV inputs still pass duration extraction

### Provider routing
- `en` uses Mistral
- `fr` uses Mistral
- `ja` uses fallback provider
- unsupported locale still returns 400

### Frontend alignment
- Voxtral-supported locales show 3–25 second guidance
- fallback locales remain selectable in the UI
- frontend guidance does not incorrectly imply that all locales use Voxtral
- clone page copy stays aligned with backend validation behavior

### Storage behavior
- reference audio is not uploaded to R2
- generated output is uploaded to R2
- output cache still works

### Persistence
- `saveAudioFile()` receives:
  - `model: 'voxtral-mini-tts-2603'`
- `insertUsageEvent()` metadata includes:
  - `model: 'voxtral-mini-tts-2603'`

### Error handling
- Mistral API error returns 500 with useful message
- malformed provider response is handled safely
- conversion failures still surface correctly

---

## Rollout notes

## Recommended rollout strategy

- implement behind code path for supported locales only
- keep fallback provider for all other locales
- monitor:
  - error rate
  - duration validation failures
  - output quality complaints
  - latency
  - provider request failures

## Optional future follow-ups

- move more locales if Voxtral support expands
- further refine provider-aware frontend guidance and client-side validation
- add better input quality guidance in UI
- add audio quality heuristics:
  - single-speaker detection
  - silence ratio
  - clipping/noise heuristics
- remove fallback provider if no longer needed

---

## Risks

### 1. Locale normalization mismatch
Need to ensure app locale codes match provider routing expectations.

### 2. Mistral request ID availability
May need a fallback internal request ID if provider response does not expose one.

### 3. Duration extraction edge cases
Valid OGG/Opus files may still need robust duration parsing.

### 4. Test assumptions tied to old R2 reference upload flow
Existing tests currently assume reference audio upload and cache keys based on uploaded input paths. These must be updated carefully.

---

## Acceptance criteria

- Supported locales use Mistral Voxtral
- Reference audio is never uploaded to R2
- Generated output is still uploaded to R2
- Output caching still works
- Voxtral locales enforce 3–25 second reference audio duration
- `runBackgroundTasks()` persists `voxtral-mini-tts-2603` as `modelUsed`
- Existing fallback locales still work through the old provider path
- The clone frontend reflects provider-aware guidance for Voxtral-supported locales while keeping fallback locales available
- Route tests pass with updated expectations
- Environment/docs are updated if new env vars are introduced
