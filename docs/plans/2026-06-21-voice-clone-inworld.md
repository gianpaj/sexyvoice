# Add Inworld as a third voice-clone provider

## Context

The voice-clone page (`/dashboard/clone`) currently supports two providers, chosen
**automatically by locale** in the backend: Voxtral-supported locales → `mistral`,
everything else → `replicate` (Chatterbox). There is no provider choice in the UI.

We want to add **Inworld TTS** as a third provider with these confirmed decisions:

1. **True clone** — upload the user's reference audio to Inworld's Voice Cloning API to
   mint a `voiceId`, then synthesize the target text with that voice (non-streaming).
2. **User-selectable** — add a provider/engine dropdown in the front-end so the user can
   explicitly pick Inworld (default stays "Auto" = current locale-based behavior).
3. **Server-side `Authorization: Basic <key>`** — store the base64 Basic credential in a
   new `INWORLD_API_KEY` env var; the key never reaches the client.

Outcome: a user can pick "Inworld" in the clone form and get audio cloned from their
reference sample via Inworld, alongside the existing Mistral/Replicate engines.

## Inworld API (two calls, non-streaming)

**1. Clone** — `POST https://api.inworld.ai/voices/v1/voices:clone`

```json
{
  "displayName": "<name>",
  "langCode": "EN_US",
  "voiceSamples": [{ "audioData": "<base64 wav/mp3>" }]
}
```

→ response `{ "voice": { "voiceId": "..." }, ... }`. Constraints: reference audio 3–15s,
wav/mp3, ≤4MB. Cloned voices **persist** in the Inworld workspace.

**2. Synthesize** — `POST https://api.inworld.ai/tts/v1/voice`

```json
{
  "text": "<text>",
  "voiceId": "<from clone>",
  "modelId": "inworld-tts-2",
  "deliveryMode": "CREATIVE",
  "language": "en-US",
  "audioConfig": { "speakingRate": 1 }
}
```

→ response `{ "audioContent": "<base64 MP3>" }`. **Output is MP3, not WAV** — this matters
for upload mime type and the cached filename extension.

Both calls use header `Authorization: Basic <INWORLD_API_KEY>`.

## Plan

### 1. New module `apps/web/lib/clone/inworld.ts`

Encapsulate everything Inworld-specific so `route.ts` stays thin:

- `INWORLD_SUPPORTED_LOCALE_CODES` — `Set` of our locale codes Inworld supports:
  `en, es, pt, it, de, fr, ar, pl, nl, hi, he, zh, ko, ja, ru`.
- `INWORLD_LANG_CODE` map: our locale → `{ langCode, language }`, e.g.
  `en → { langCode: 'EN_US', language: 'en-US' }`, `pt → { langCode: 'PT_BR', language: 'pt-BR' }`,
  `zh → { langCode: 'ZH_CN', language: 'zh-CN' }`, etc.
- `INWORLD_MIN_DURATION = 3`, `INWORLD_MAX_DURATION = 15`.
- `getInworldAuthHeader()` → reads `process.env.INWORLD_API_KEY` (throw if missing),
  returns `Basic ${key}`. Mirror the `getMistralClient()` guard pattern in `route.ts:189`.
- `cloneVoiceWithInworld({ text, locale, referenceAudioBuffer })`:
  1. POST to `voices:clone` with base64 of the reference buffer + mapped `langCode` +
     a `displayName` (e.g. `sexyvoice-${audioHash-or-uuid}`); read `voice.voiceId`.
  2. POST to `tts/v1/voice` with that `voiceId`, `modelId: 'inworld-tts-2'`,
     `deliveryMode: 'CREATIVE'`, mapped `language`, `audioConfig.speakingRate: 1`.
  3. Decode `audioContent` base64 → `Buffer`; throw if empty.
  - Return `{ buffer, mimeType: 'audio/mpeg', modelUsed: 'inworld-tts-2', requestId }`
    (`requestId = randomUUID()` since Inworld doesn't return one).
  - On `!response.ok`: treat 5xx via `isTransientProviderFailure` →
    `createProviderUnavailableRouteError('inworld')`; surface 4xx (e.g. moderation) as a
    `RouteError` with `errors.guardrailViolation` or `errors.providerUnavailable`.
  - **Best-effort cleanup:** optionally `DELETE` the minted voice after synthesis (in the
    background task) so the workspace doesn't accumulate clones. Note as follow-up if the
    delete endpoint isn't wired in v1.

### 2. `apps/web/lib/clone/constants.ts`

- Extend the union: `export type CloneProvider = 'mistral' | 'replicate' | 'inworld';`

### 3. `apps/web/app/api/clone-voice/route.ts`

- **Provider selection:** `parseFormData` reads an optional `provider` field; add it to
  `FormInput`. Change `resolveCloneProvider(locale, requested?)` to return `requested`
  when present (after validating it's a known provider AND supports the locale), else keep
  the existing locale-based default. Add `validateProviderLocale(provider, locale)` that
  rejects Inworld + an unsupported locale with a new `errors.providerLocaleUnsupported`.
- **Constraints:** `getCloneProviderConstraints` returns `minDurationSeconds:
INWORLD_MIN_DURATION` for `inworld`. In `processAudioFile`, set `referenceAudioMaxDuration`
  to `INWORLD_MAX_DURATION` for inworld (alongside the existing mistral/replicate branch at
  `route.ts:789`), and include inworld in `shouldNormalizeToWav` (Inworld wants WAV/MP3
  base64) — i.e. `provider === 'mistral' || provider === 'inworld' || ...`.
- **Duration error message:** add an `inworld` branch in `validateAudioDuration` (reuse the
  Voxtral-style "at least N seconds" message via a new/`shared` key).
- **Generation branch:** in `POST`, add `else if (provider === 'inworld')` calling
  `cloneVoiceWithInworld(...)` with `cloneInputAudio.buffer`. Unlike replicate it does **not**
  need to pre-upload the reference to R2 (Inworld takes base64 inline).
- **MP3 output handling:**
  - `createCloneOutputFilename` takes an `extension` (or `outputMimeType`) param; inworld →
    `.mp3`, others stay `.wav`. (Currently hardcoded `.wav` at `route.ts:1101`.)
  - `uploadGeneratedAudio(result.buffer, filename, 'audio/mpeg')` for inworld.
  - Compute `duration` from the generated MP3 buffer via `getAudioDuration` (already imported).
- **Error union:** add `'errors.providerLocaleUnsupported'` to `CloneRouteErrorCode`.

### 4. Cost / credits — `apps/web/lib/utils.ts`

- Add an `'inworld'` branch to `getDollarCost(provider, credits, text)` (currently switches
  `mistral`/`replicate` at ~line 394). Rate is **$17.5 per 1M characters** for the
  `inworld-tts-2` model: `(text.length / 1_000_000) * 17.5` (i.e. `text.length * 0.0000175`).
  Define it as a named constant (e.g. `INWORLD_TTS2_DOLLARS_PER_MILLION_CHARS = 17.5`).
- `estimateCredits(text, 'clone')` stays provider-agnostic — reuse as-is.
- Text limits (`getCloneTextMaxLength`) remain **locale-based**, not provider-based. Leave
  as-is; flag that Inworld + a non-Voxtral locale falls back to the 300-char limit (acceptable
  for v1, revisit if needed).

### 5. Front-end — provider dropdown

- `clone-state.ts`: add `selectedProvider: CloneProvider | 'auto'` to `CloneState`
  (default `'auto'`). The patch reducer needs no other change.
- New component `clone-provider-select.tsx`, modeled on `clone-language-select.tsx`
  (shadcn `Select`), options: **Auto (Recommended)**, Replicate, Mistral, Inworld. Dispatch
  `{ type: 'patch', patch: { selectedProvider } }`. Disabled while `status === 'generating'`.
- `new.client.tsx`:
  - Render `<CloneProviderSelect>` next to `<CloneLanguageSelect>` (~line 630).
  - In `handleGenerate`, `formData.append('provider', selectedProvider)` only when
    `selectedProvider !== 'auto'`.
  - Extend the FFmpeg preload condition (`usesVoxtral`) to also preload when Inworld is
    selected, since Inworld needs WAV reference audio (mic webm→wav conversion already runs
    at generation time, so this is just an optimization).
  - Surface the new `providerLocaleUnsupported` error via existing `getCloneErrorMessage`.

### 6. i18n — `apps/web/messages/*.json`

Add to the `clone` namespace (and mirror across all locale files):

- `providerLabel`, `providerAuto`, `providerReplicate`, `providerMistral`, `providerInworld`
  (+ optional descriptions).
- `errors.providerLocaleUnsupported` (reuse `errors.providerUnavailable` /
  `errors.guardrailViolation` for the others).

### 7. Env / test harness — `apps/web/tests/setup.ts`, `.env.example`

- Add `INWORLD_API_KEY=xxx` to `.env.example` (next to `MISTRAL_API_KEY`, ~line 46).
- In `tests/setup.ts`: set `process.env.INWORLD_API_KEY = 'test-inworld-key';` (next to the
  existing `REPLICATE_API_TOKEN`/`MISTRAL_API_KEY` lines).
- Inworld is called via raw `fetch`, so add **default MSW handlers** to the shared `server`
  in `setup.ts` for the happy path (other providers already have mock fns):
  - `http.post('https://api.inworld.ai/voices/v1/voices:clone', ...)` → `{ voice: { voiceId: 'test-inworld-voice-id' } }`.
  - `http.post('https://api.inworld.ai/tts/v1/voice', ...)` → `{ audioContent: <base64 of a tiny MP3/bytes> }`.
- Grep for a typed env schema (e.g. `t3-env`/zod env) and add the var there if one exists.

### 8. Backend tests — `apps/web/tests/clone-voice.test.ts`

- Extend `createFormDataWithAudio(...)` to accept an optional `provider` arg and append it
  to the FormData when set (keeps all existing call sites working).
- Add a new `describe('Inworld provider')` block covering:
  - **Happy path:** `provider=inworld`, `locale=en` → 200, `json.url` contains
    `files.sexyvoice.ai`, `saveAudioFile` called with `model: 'inworld-tts-2'` and usage
    metadata `provider: 'inworld'`.
  - **MP3 output:** cache key / upload assert `en-inworld-...\.mp3` and
    `uploadFileToR2(..., 'audio/mpeg')` (mirrors the existing `en-mistral-...\.wav` regex tests).
  - **Unsupported locale:** `provider=inworld` with a locale Inworld doesn't support (e.g.
    `sw`) → 400, `code: 'errors.providerLocaleUnsupported'`.
  - **Provider unavailable:** override the MSW handler to return a 502 from `voices:clone` or
    `tts/v1/voice` → 503, `code: 'errors.providerUnavailable'`, `details: { provider: 'inworld' }`
    (mirrors the existing Replicate 5xx test).
  - **Auto unchanged:** without a `provider` field, English still routes to Mistral and
    Japanese to Replicate (existing tests already assert this — just confirm they still pass).

## Files to touch

- **New:** `apps/web/lib/clone/inworld.ts`,
  `apps/web/app/[lang]/(dashboard)/dashboard/clone/clone-provider-select.tsx`
- **Edit:** `apps/web/lib/clone/constants.ts`,
  `apps/web/app/api/clone-voice/route.ts`,
  `apps/web/lib/utils.ts`,
  `apps/web/app/[lang]/(dashboard)/dashboard/clone/clone-state.ts`,
  `apps/web/app/[lang]/(dashboard)/dashboard/clone/new.client.tsx`,
  `apps/web/messages/*.json`, `.env.example`,
  `apps/web/tests/setup.ts`, `apps/web/tests/clone-voice.test.ts`

## Verification

1. **Lint/types:** run the repo's typecheck + biome/lint on changed files.
2. **Unit:** run `apps/web/tests/clone-voice.test.ts` — existing tests still pass and the new
   `Inworld provider` block (section 8) is green.
3. **Manual (with a real `INWORLD_API_KEY`):** `pnpm dev`, open `/dashboard/clone`, upload a
   5–15s sample, pick **Inworld**, choose a supported locale (e.g. English), enter text,
   Generate → confirm an MP3 plays in the Preview tab and a row is saved. Then verify
   Auto/Mistral/Replicate paths are unchanged.
4. Confirm the cached output URL has a `.mp3` extension for Inworld and `.wav` for others.

## Open items to confirm before/while implementing

- Whether to **delete** the minted Inworld voice after synthesis (workspace cleanup) in v1.
