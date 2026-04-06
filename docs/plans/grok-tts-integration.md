# Grok TTS integration plan

## Summary

This document describes how to add **xAI Grok Text-to-Speech** support to the existing dashboard generation flow while keeping the same `app/api/generate-voice/route.ts` API route.

The integration should:

- use the existing `voices` table and route through voice `model`
- treat `model = 'grok'` as an xAI TTS provider
- keep Gemini support unchanged
- keep Replicate support unchanged
- **remove style prompt support for Grok**
- add a **Grok advanced tagging UI**
- support **Grok codec selection** such as `mp3` and `wav`
- charge Grok generations using a **character-based credit estimate**
- keep all Grok logic inside the current generation route rather than introducing a separate API

---

## Goals

1. Keep using `app/api/generate-voice/route.ts`
2. Use DB voice rows with `model = 'grok'`
3. Call xAI `POST /v1/tts` for Grok voices
4. Support user-selectable output codec for Grok
5. Remove Gemini-style `styleVariant` behavior for Grok
6. Add UI controls for Grok expressive tags:
   - inline tags like `[laugh]`
   - wrapping tags like `<fast>...</fast>`
7. Bill Grok generations by **characters sent**
8. Preserve caching, credit checks, R2 upload, analytics, and usage tracking

---

## Non-goals

1. Do not create a new Grok-specific API route
2. Do not add DB schema changes unless later required
3. Do not implement token-based billing for Grok
4. Do not reuse Gemini style prompting for Grok
5. Do not expose every possible xAI audio option in the first iteration

---

## Source of truth for provider selection

Provider selection should continue to be based on `voices.model`.

### Expected model values

- `gpro` → Gemini TTS
- `grok` → xAI Grok TTS
- any Replicate model slug → Replicate

This keeps the integration aligned with the current architecture, where voices are selected by DB row and the backend chooses the provider.

---

## Files to update

### Backend

- `app/api/generate-voice/route.ts`
- `lib/utils.ts`
- `lib/ai.ts` if provider capability helpers or text limits are added
- new helper file, recommended:
  - `lib/xai.ts`
  - or `lib/tts/xai.ts`

### Frontend

- `app/[lang]/(dashboard)/dashboard/generate/generateui.client.tsx`
- `components/audio-generator.tsx`
- `components/voice-selector.tsx`

### Content / translations

- `messages/en.json`
- matching keys in all other locale files

### Tests

- relevant API route tests
- utility tests
- UI/component tests if present

---

## Current behavior to preserve

The current route already handles:

- request validation
- authenticated user lookup
- voice lookup from Supabase
- credit availability check
- text length limits
- Redis cache lookup
- audio upload to R2
- DB persistence
- analytics and usage event tracking

The Grok integration should fit into that flow, not replace it.

---

## Backend implementation spec

## 1. Keep the same API route

Continue using:

```sexyvoice/app/api/generate-voice/route.ts#L1-999
export async function POST(request: Request) {
  // provider selection and generation happen here
}
```

No new API endpoint is needed.

### Request body

Current request body already includes:

- `text`
- `voice`
- `styleVariant`

Add one optional field:

- `outputCodec`

### Intended request contract

- `text: string` — required
- `voice: string` — required
- `styleVariant?: string` — only used by Gemini
- `outputCodec?: 'mp3' | 'wav'` — used by Grok

### Behavior by provider

- Gemini:
  - uses `styleVariant`
  - ignores `outputCodec`
- Grok:
  - ignores `styleVariant`
  - uses `outputCodec`
- Replicate:
  - ignores both unless later needed

---

## 2. Replace binary provider logic with provider-aware branching

Current backend logic is effectively:

- if `voiceObj.model === 'gpro'` → Gemini
- else → Replicate

This should be refactored into:

- if `voiceObj.model === 'gpro'` → Gemini
- else if `voiceObj.model === 'grok'` → xAI Grok
- else → Replicate

### Recommended helper

Introduce a helper such as:

- `getTtsProvider(model: string): 'gemini' | 'grok' | 'replicate'`

This helper can live in `lib/ai.ts`, `lib/utils.ts`, or a new provider utility module.

---

## 3. Add Grok request helper

A dedicated helper should wrap xAI TTS calls to keep `route.ts` readable.

### Recommended file

- `lib/xai.ts`

### Suggested responsibilities

- verify `process.env.XAI_API_KEY`
- accept:
  - `text`
  - `voiceId`
  - `language`
  - `codec`
  - `signal`
- call `https://api.x.ai/v1/tts`
- send a normalized request body
- return:
  - `audioBuffer`
  - `contentType`
  - `codec`
  - optionally raw response info for diagnostics

### Suggested request payload

The helper should send:

- `text`
- `voice_id`
- `language`
- `output_format`

Example shape:

```sexyvoice/docs/plans/grok-tts-integration.md#L1-999
{
  "text": "Hello world",
  "voice_id": "eve",
  "language": "en",
  "output_format": {
    "codec": "mp3"
  }
}
```

If xAI requires or benefits from additional `output_format` fields like sample rate or bit rate, those can be set centrally in the helper.

---

## 4. Normalize DB language for xAI

The DB `voices.language` value may not exactly match xAI accepted language codes.

A small language normalization helper should be added for Grok requests.

### Recommended behavior

- if DB language is already xAI-compatible, pass it through
- map variants to supported codes
- fallback to `auto` when needed

### Examples

- `en` → `en`
- `en-US` → `en`
- `en-GB` → `en`
- `it` → `it`
- `it-IT` → `it`
- `es-ES` → `es-ES`
- `es-MX` → `es-MX`
- `multiple` → `auto`

### Recommendation

Prefer explicit mapping over relying on raw DB values.

---

## 5. Support codec selection for Grok

Grok supports multiple codecs. The first version should expose a controlled subset.

### Initial supported codecs

- `mp3`
- `wav`

### Why this subset

- simple UX
- common user expectations
- straightforward upload content types
- enough to validate provider support without overcomplicating the UI

### Backend codec behavior

For Grok:

- default codec should be `mp3`
- if request contains `outputCodec`, validate it against supported options
- derive:
  - file extension
  - content type
  - xAI `output_format.codec`

### Mapping

- `mp3` → extension `.mp3`, content type `audio/mpeg`
- `wav` → extension `.wav`, content type `audio/wav`

### Deferred note: PCM tradeoffs

xAI can also return `pcm` with content type `audio/pcm`.

PCM is attractive because it is efficient for:

- low-latency pipelines
- real-time processing
- server-side audio transformation
- avoiding temporary object storage for ephemeral playback flows

However, raw PCM is **not** as directly browser-friendly as `mp3` or `wav` in the current dashboard architecture.

### Why PCM is deferred

The current `generate-voice` flow is based on:

- server generation
- returning JSON with a hosted `url`
- browser playback from a standard audio file URL

Raw PCM does not naturally fit that contract because it usually requires extra playback handling on the client, such as:

- format metadata awareness
- manual decoding
- Web Audio API playback instead of a simple hosted file URL

### Practical implication

For the first Grok implementation:

- keep the default Grok codec as `mp3`
- support `wav` as an alternative
- defer `pcm` until a later iteration

### Future PCM path

A later iteration can revisit PCM for a lower-latency or no-R2 flow. Likely options include:

- returning direct binary audio from the route instead of JSON + URL
- returning inline audio payloads plus format metadata
- converting PCM to WAV in memory before returning it to the client

This keeps the first Grok rollout aligned with the current product architecture while leaving room for a more direct PCM-based playback path later.

---

## 6. Update cache key strategy

Current route hashes:

- `text`
- `voice`

That is no longer sufficient once Grok adds provider selection and codec output.

### New cache hash inputs

The cache hash should include:

- text
- voice
- model

### Recommended hash input

```sexyvoice/docs/plans/grok-tts-integration.md#L1-999
`${text}-${voice}-${voiceObj.model}`
```

### Why this matters

Including `model` in the cache key prevents collisions if voice names ever overlap across providers.

For v1, codec is intentionally excluded from the cache key because the frontend will request only one Grok codec.

---

## 7. Make filename extension provider-aware

Current route uses a hardcoded `.wav` filename before branching. That should be replaced.

### New behavior

The filename extension should be determined after provider and codec resolution.

### Expected outcomes

- Gemini → `.wav`
- Grok `mp3` → `.mp3`
- Grok `wav` → `.wav`
- Replicate → use the actual format if known, otherwise preserve current behavior until separately cleaned up

### Recommendation

Introduce a small helper that returns:

- `extension`
- `contentType`

based on provider and codec.

---

## 8. Grok credits must be character-based

This is a required behavior change.

### Current state

The route currently:

- estimates all requests with `estimateCredits(text, voice, model)`
- recalculates actual Gemini cost using token metadata
- leaves non-Gemini providers estimate-based

### Required Grok behavior

Grok should:

- estimate cost from characters
- be charged from characters
- not use token extrapolation

### Important billing rule

For Grok, count the exact request text sent to xAI.

That means:

- visible text counts
- inserted tags count
- wrapping tags count
- inline tags count

This is desirable because Grok cost is tied to characters sent.

---

## 9. Update `estimateCredits` to support Grok explicitly

`lib/utils.ts` currently uses a word-based estimation approach. Grok should not use that path.

### Required change

Branch credit estimation by provider/model.

### Recommended structure

- existing behavior for Replicate voices
- existing Gemini behavior as-is
- new Grok-specific estimator

### Suggested helper

- `estimateGrokCredits(text: string): number`

### Suggested formula

Grok will use credits per N characters with a dedicated multiplier variable in `lib/utils.ts`, alongside the existing credit calculation path centered around `calculateCredits(...)`.

Recommended shape:

```sexyvoice/docs/plans/grok-tts-integration.md#L1-999
Math.ceil(text.length / GROK_CHAR_BUCKET) * GROK_CREDITS_PER_BUCKET
```

### Decision

Use a bucketed character-based formula for Grok.

Implementation should introduce explicit constants such as:

- `GROK_CHAR_BUCKET`
- `GROK_CREDITS_PER_BUCKET`

This keeps Grok billing character-native while making the pricing easy to tune later.

### Recommendation

Keep the Grok estimator completely character-native and do not mix words and characters for this provider.

---

## 10. Final charge behavior by provider

### Gemini

- pre-check with estimate
- actual charge from token metadata when available

### Grok

- pre-check with character-based estimate
- actual charge using that same character-based amount
- no token-based override

### Replicate

- pre-check with current estimate behavior
- actual charge remains estimate-based

---

## 11. Grok branch flow inside route

### Steps

1. Resolve `voiceObj`
2. Detect provider `grok`
3. Build final text:
   - do **not** prefix with `styleVariant`
   - use text exactly as entered
4. Validate text length
5. Estimate Grok credits from text length
6. Check user credits
7. Build cache key using model
8. Call xAI TTS helper
9. Upload returned audio to R2 using codec-specific content type
10. Save file metadata and usage event
11. Deduct estimated credits
12. Return URL and remaining credits in the existing JSON response contract

### Important note

For Grok, the input text should remain unchanged apart from whatever tags the user inserts into the editor. No hidden style transformation should be applied.

---

## 12. Grok error handling

Add a provider-specific error path for xAI failures.

### On non-OK response from xAI

Log:

- HTTP status
- response body
- requested voice
- normalized language
- codec
- text length

### Throw

A provider-specific error cause such as:

- `XAI_TTS_ERROR`

### Response to client

Initially it is acceptable to map this to a generic voice-generation failure, but the internal error should still be provider-specific for observability.

### Optional extension

Add new error code entries in `lib/utils.ts` if cleaner UX messaging is desired.

---

## 13. Analytics and usage tracking

The existing tracking flow should remain.

### Grok usage event metadata should include

- `voiceId`
- `voiceName`
- `model`
- `textPreview`
- `textLength`
- provider info if added
- selected codec
- `userHasPaid`

### Recommendation

If metadata currently uses `isGeminiVoice`, consider replacing or supplementing it with a more general provider field.

Example:

- `provider: 'grok' | 'gemini' | 'replicate'`

This avoids misleading analytics once Grok exists.

---

## 14. Environment variables

The Grok integration requires:

- `XAI_API_KEY`

### Required documentation updates

- add `XAI_API_KEY` to `.env.example` if missing
- mention it in any environment setup docs where relevant

---

## Frontend implementation spec

## 15. `generateui.client.tsx` responsibilities

`GenerateUI` should remain responsible for top-level generate page state.

### Current state

- `selectedVoice`
- `selectedStyle`

### New state needs

- `selectedVoice`
- `selectedStyle` only for Gemini
- `selectedGrokCodec` for Grok output format

### Recommended behavior

- initialize selected voice dynamically from `publicVoices`
- avoid hardcoding a specific voice if possible
- keep `selectedStyle` for Gemini only
- pass `selectedGrokCodec` down to `AudioGenerator`
- preserve the existing JSON response contract from the backend

---

## 16. Provider capability flags in the frontend

Frontend components should stop relying on a single binary `isGeminiVoice` concept.

### Recommended capability model

Derived from `selectedVoice.model`:

- `isGeminiVoice`
- `isGrokVoice`
- `supportsStylePrompt`
- `supportsAdvancedTags`
- `supportsCodecSelection`
- `showsEnhanceButton`

### Provider behavior

#### Gemini (`gpro`)
- style prompt: yes
- advanced tags UI: no
- codec selector: no
- enhance button: no

#### Grok (`grok`)
- style prompt: no
- advanced tags UI: yes
- codec selector: yes
- enhance button: no

#### Replicate
- style prompt: no
- advanced tags UI: no for now
- codec selector: no
- enhance button: yes

---

## 17. `voice-selector.tsx` changes

### Current Gemini-only behavior

The component currently shows a style textarea when a Gemini voice is selected.

### Required change

Show style textarea only when:

- `selectedVoice.model === 'gpro'`

### Grok behavior

For Grok:

- do not show style textarea
- show provider-specific help text instead

### Tooltip copy by provider

The info tooltip should become provider-aware:

- Gemini tooltip for `gpro`
- Grok tooltip for `grok`
- existing Orpheus/Replicate tooltip for other models

### Grok tooltip recommendation

Describe that Grok supports:

- expressive inline tags like `[laugh]`
- wrapping style tags like `<fast>...</fast>`

---

## 18. `audio-generator.tsx` changes

This component needs the main Grok UI work.

### Current behavior

- Gemini gets special style prompt handling
- non-Gemini shows enhancement affordances
- text area is the main editing surface

### New Grok behavior

When selected voice is Grok:

- show an **Effects** control
- show a **Format** selector
- do not use style prompt
- hide the AI enhancement LLM button
- send `outputCodec` with the request

---

## 19. Grok advanced tag UI

### Objective

Allow users to insert Grok-supported expressive tags into the text area without manually typing them all.

### Final implementation direction

The editor ended up using a **Tiptap-based rich text surface with plain-text serialization**, not a raw textarea and not a full semantic AST editor.

That means:

- users edit inside a ProseMirror/Tiptap editor
- supported Grok tags are rendered as chips / boundaries in the editor UI
- the persisted and submitted value is still plain text such as:
  - `[breath]`
  - `<soft>Hello</soft>`
  - `<emphasis>`
- unsupported tags remain plain text and are visually highlighted rather than normalized into chips

This gives us a better editing experience without changing the backend request contract.

### Shared tag source of truth

Long term, the supported Grok tag catalog should live in one shared place.

The implementation now centralizes tag definitions in `lib/tts-editor.ts` and exports:

- `GROK_INSTANT_TAGS`
- `GROK_WRAPPING_TAGS`
- `GROK_INSTANT_TAG_DEFINITIONS`
- `GROK_WRAPPING_TAG_DEFINITIONS`

These shared constants are intended to be reused by:

- parser / serializer logic
- editor suggestion menus
- auto-convert normalization
- tests

Preferred convention for future work:

- use constants directly for static Grok tag catalogs
- use `*_DEFINITIONS` constants for UI/editor metadata
- avoid thin accessor functions that only return static constants
- keep functions only for behavior, parsing, serialization, or computed transformations

This is the preferred long-term architecture because future tag additions should require updating one shared module instead of multiple duplicated arrays across editor code, normalization code, and tests.

### UI components

Add a Grok-only control near the text area such as:

- a token-chip style `Effects` control
- optionally grouped into:
  - inline effects
  - wrapping styles

This should remain a plain-text editing experience with helper insertion controls:

- token chips are desired
- no AST or structured rich-text model is needed
- no tag validation is required in v1

### Inline effect tags

Examples from xAI docs:

- `[pause]`
- `[long-pause]`
- `[hum-tune]`
- `[laugh]`
- `[chuckle]`
- `[giggle]`
- `[cry]`
- `[tsk]`
- `[tongue-click]`
- `[lip-smack]`
- `[breath]`
- `[inhale]`
- `[exhale]`
- `[sigh]`

### Wrapping style tags

Examples from xAI docs:

- `<soft>`
- `<whisper>`
- `<loud>`
- `<build-intensity>`
- `<decrease-intensity>`
- `<higher-pitch>`
- `<lower-pitch>`
- `<slow>`
- `<fast>`
- `<sing-song>`
- `<singing>`
- `<laugh-speak>`
- `<emphasis>`

### Final editor behavior notes

The implemented editor behavior is more specific than the original plan:

- supported instant tags auto-convert into chips
- supported wrapper tags auto-convert into wrapper boundary chips
- a completed standalone opening wrapper tag such as `<emphasis>` is preserved as a standalone opening boundary chip
- pasted supported Grok tags are normalized into chips / boundaries
- unsupported tags remain text and are highlighted
- the visible editor model is richer than the submitted text model, but serialization remains plain text

---

## 20. Tag insertion behavior

The tag controls must integrate with the text area cursor and selection.

### Inline tags

When the user selects an inline effect:

- insert the tag at the current cursor position

Example:

```sexyvoice/docs/plans/grok-tts-integration.md#L1-999
Hello there [laugh]
```

### Wrapping tags with selected text

If the user has selected text and chooses a wrapping tag:

- wrap the selection

Example:

```sexyvoice/docs/plans/grok-tts-integration.md#L1-999
<fast>I am speaking quickly</fast>
```

### Wrapping tags with no selected text

If there is no selection:

- insert opening and closing tags
- place the caret between them

Example insertion:

```sexyvoice/docs/plans/grok-tts-integration.md#L1-999
<fast></fast>
```

with cursor placed between tags.

### Suggestion and normalization behavior

The implemented editor also supports typed-entry flows, not just button insertion.

Current behavior to preserve:

- typing `[` opens the instant-tag suggestion flow
- typing `<` opens the wrapper-tag suggestion flow
- typing a supported instant tag and then `]` closes the suggestion flow and auto-converts the tag into a chip
- typing a supported wrapper opening tag and then `>` closes the suggestion flow and auto-converts the opening tag into a standalone opening boundary chip
- typing unsupported completed tags closes the suggestion flow but leaves the text as plain text
- typing `<` before existing partial wrapper text should not incorrectly open the wrapper suggestion flow

### Auto-convert behavior

The editor includes an auto-convert normalization layer that reparses the current plain-text serialization and replaces the document only when the normalized ProseMirror document is structurally different.

Important implementation notes:

- structural equality should use ProseMirror node equality, not `JSON.stringify()`
- document replacement should use a valid ProseMirror replace operation for the full document slice
- selection offsets should be preserved across normalization
- partial supported instant tags and partial supported wrapper opening tags should normalize into supported tags when completed

### UX importance

This is necessary for the advanced tagging UI to feel useful rather than just decorative.

The inserted Grok tags should count toward:

- the visible character counter
- text length validation
- Grok billing estimate

This is the v1 behavior until the Grok API semantics are better understood.

---

## 21. Grok codec selector UI

When the selected voice is Grok, add a format selector near the generate controls.

### Initial options

- MP3
- WAV

### Default

- MP3

### Request behavior

On generate, include:

- `outputCodec: 'mp3' | 'wav'`

### Display recommendation

Keep the selector compact and only show it for Grok to avoid cluttering the experience for other providers.

---

## 22. Remove Grok style prompt support

The style prompt currently used for Gemini must not apply to Grok.

### Required behavior

When selected voice is Grok:

- do not render the style textarea
- do not prepend `styleVariant` to text
- do not send Grok text through Gemini-style prompt shaping

This is both a product and technical requirement.

---

## 23. Optional text enhancement behavior

The existing non-Gemini enhancement button should not be assumed to be Grok-compatible.

### Recommendation for first iteration

- keep the new Grok advanced tags UI as the primary Grok enhancement path
- do not depend on the existing text enhancement flow for Grok
- hide the sparkle / AI enhancement button for Grok

This avoids mixing two separate mechanisms before validation.

---

## Translation / copy spec

## 24. New translation keys needed

Add new keys to `messages/en.json` and all locale files.

### Suggested areas

- provider-specific voice info
- Grok effects button label
- Grok format selector label
- codec labels
- helper copy for Grok tags
- optional empty-state or tooltip text

### Example categories

- `generate.voiceSelector.grokInfo`
- `generate.grok.effects`
- `generate.grok.inlineEffects`
- `generate.grok.wrappingEffects`
- `generate.grok.format`

### Requirement

Do not hardcode new user-facing English strings in the UI.

Translate the UI labels and helper text, but do **not** translate the Grok tag literals themselves, such as:

- `[laugh]`
- `<fast>`
- `</fast>`

---

## Testing plan

## 25. Backend tests

Add or update tests covering:

1. `model === 'grok'` routes generation to xAI branch
2. Grok requests do not apply `styleVariant`
3. Grok requests pass `voiceObj.name` as `voice_id`
4. Grok requests normalize language correctly
5. Grok requests pass selected codec correctly
6. cache key includes model
7. Grok credits are character-based
8. Grok final charge equals Grok estimated charge
9. missing `XAI_API_KEY` produces a server error
10. xAI non-OK responses are handled and surfaced properly
11. the Grok path preserves the existing JSON response contract

---

## 26. Utility tests

Update or add tests for:

- Grok credit estimation helper
- provider detection helper
- codec/content-type mapping helper
- language normalization helper

---

## 27. Frontend tests

If component tests exist or are added, cover:

- Grok voice hides style prompt
- Grok voice hides the sparkle / AI enhancement button
- Grok voice shows effects UI
- Grok voice shows codec selector
- selecting inline tag inserts text at cursor
- selecting wrapping tag wraps selection
- Grok generate request includes `outputCodec`
- Gemini generate request still includes `styleVariant`
- non-Grok voices do not show Grok-specific controls

---

## Rollout plan

## 28. Implementation order

1. Add provider detection helper
2. Add xAI helper module
3. Add Grok character-based estimator
4. Refactor `generate-voice` route to support Grok
5. Add codec-aware filename and cache behavior
6. Update `GenerateUI` state for Grok codec
7. Update `VoiceSelector` to hide style prompt for Grok
8. Add Grok advanced tagging UI to `AudioGenerator`
9. Add translations
10. add tests
11. run formatting, lint, and type checks

---

## 29. Implementation task checklist

Use this checklist as the execution order for the actual implementation work.

### Phase 1 — backend foundation

- [ ] Add provider detection helper for:
  - [ ] Gemini
  - [ ] Grok
  - [ ] Replicate
- [ ] Place provider-specific Grok helper under:
  - [ ] `lib/tts/xai.ts`
- [ ] Add Grok codec type support for the first iteration:
  - [ ] `mp3`
  - [ ] `wav`
- [ ] Add Grok language normalization helper
- [ ] Add Grok codec-to-content-type / extension mapping helper
- [ ] Add Grok credit estimation helper using character-based billing
- [ ] Introduce Grok pricing constants in `lib/utils.ts`
- [ ] Reuse existing app text-limit policy for Grok:
  - [ ] free: 500
  - [ ] paid: 1000

### Phase 2 — xAI integration

- [ ] Add xAI helper module
- [ ] Validate `XAI_API_KEY`
- [ ] Implement xAI request payload creation
- [ ] Pass DB voice name as `voice_id`
- [ ] Normalize DB language before request
- [ ] Pass selected Grok codec as `output_format.codec`
- [ ] Parse binary response into an audio buffer
- [ ] Handle Grok non-OK responses with provider-specific logging
- [ ] Add provider-specific error cause for Grok failures

### Phase 3 — `generate-voice` route refactor

- [ ] Keep the existing `app/api/generate-voice/route.ts` route
- [ ] Extend request body parsing to accept `outputCodec`
- [ ] Keep `styleVariant` only for Gemini
- [ ] Add provider-aware branching:
  - [ ] Gemini path
  - [ ] Grok path
  - [ ] Replicate path
- [ ] Ensure Grok does not prepend `styleVariant` to text
- [ ] Build cache hash from:
  - [ ] text
  - [ ] voice
  - [ ] model
- [ ] Exclude codec from cache key in v1
- [ ] Make filename extension provider-aware
- [ ] Make upload content type provider-aware
- [ ] Keep R2 upload flow for first Grok rollout
- [ ] Preserve the existing JSON response contract:
  - [ ] `url`
  - [ ] `creditsUsed`
  - [ ] `creditsRemaining`

### Phase 4 — billing, persistence, analytics

- [ ] Pre-check Grok credits using character-based estimate
- [ ] Charge Grok with the same character-based amount after generation
- [ ] Keep Gemini actual charge token-based
- [ ] Keep Replicate actual charge estimate-based
- [ ] Include Grok codec in saved metadata where useful
- [ ] Add provider field to usage metadata if needed
- [ ] Verify usage events remain correct for Grok
- [ ] Verify PostHog event payload still makes sense for Grok generations

### Phase 5 — generate page state and provider capabilities

- [ ] Update `generateui.client.tsx`
- [ ] Stop assuming a binary Gemini/non-Gemini model
- [ ] Add Grok codec state
- [ ] Keep Gemini style state
- [ ] Pass Grok codec to `AudioGenerator`
- [ ] Consider replacing hardcoded default voice with a dynamic initial voice

### Phase 6 — `VoiceSelector` updates

- [ ] Show Gemini style textarea only for `model === 'gpro'`
- [ ] Hide style textarea for Grok
- [ ] Add Grok-specific tooltip/help copy
- [ ] Keep existing provider copy for Gemini
- [ ] Keep existing provider copy for Replicate voices unless revised
- [ ] Make sure selector behavior remains stable with mixed providers in the voice list

### Phase 7 — Grok advanced tagging UI

- [ ] Search for a suitable React token-chip / tag-input component
- [ ] Add Grok-only Effects control near the text editor
- [ ] Keep the editor plain-text based
- [ ] Split effects into:
  - [ ] inline tags
  - [ ] wrapping tags
- [ ] Add inline tags:
  - [ ] `[pause]`
  - [ ] `[long-pause]`
  - [ ] `[hum-tune]`
  - [ ] `[laugh]`
  - [ ] `[chuckle]`
  - [ ] `[giggle]`
  - [ ] `[cry]`
  - [ ] `[tsk]`
  - [ ] `[tongue-click]`
  - [ ] `[lip-smack]`
  - [ ] `[breath]`
  - [ ] `[inhale]`
  - [ ] `[exhale]`
  - [ ] `[sigh]`
- [ ] Add wrapping tags:
  - [ ] `<soft>`
  - [ ] `<whisper>`
  - [ ] `<loud>`
  - [ ] `<build-intensity>`
  - [ ] `<decrease-intensity>`
  - [ ] `<higher-pitch>`
  - [ ] `<lower-pitch>`
  - [ ] `<slow>`
  - [ ] `<fast>`
  - [ ] `<sing-song>`
  - [ ] `<singing>`
  - [ ] `<laugh-speak>`
  - [ ] `<emphasis>`
- [ ] Implement insertion at cursor for inline tags
- [ ] Implement wrap-selection behavior for wrapping tags
- [ ] Implement empty-selection insertion with cursor placed inside wrapping tags
- [ ] Do not add AST parsing or validation in v1
- [ ] Keep Grok text unchanged except for user-inserted tags
- [ ] Count inserted tags toward the visible character counter and billing estimate

### Phase 8 — Grok codec selector UI

- [ ] Add Grok-only format selector
- [ ] Support:
  - [ ] MP3
  - [ ] WAV
- [ ] Set default Grok codec to MP3
- [ ] Include selected codec in generate request body
- [ ] Hide codec selector for non-Grok voices

### Phase 9 — translations and copy

- [ ] Add translation keys for Grok provider help text
- [ ] Add translation keys for Effects UI
- [ ] Add translation keys for codec selector UI
- [ ] Add translation keys for helper/tooltip copy
- [ ] Update all locale files, not just English
- [ ] Avoid hardcoded new strings in UI

### Phase 10 — testing

- [ ] Add backend coverage for Grok route path
- [ ] Test that Grok requests do not use `styleVariant`
- [ ] Test that Grok uses DB voice name as `voice_id`
- [ ] Test language normalization
- [ ] Test codec handling
- [ ] Test cache key composition with model
- [ ] Test Grok credit estimation
- [ ] Test Grok final credit charge
- [ ] Test missing `XAI_API_KEY`
- [ ] Test xAI failure handling
- [ ] Test Grok JSON response contract
- [x] Test that Grok hides the sparkle / AI enhancement button
- [x] Add utility tests for helpers
- [x] Add component tests for Grok UI behavior if feasible
- [x] Add parser / serializer tests for supported instant tags, wrapper tags, and standalone opening wrapper tags
- [x] Add normalization tests for partial instant tags and partial wrapper opening tags
- [x] Add suggestion lifecycle tests for `[` and `<` flows
- [x] Add paste normalization coverage for supported Grok tags

### Phase 11 — deferred work for later

- [ ] Revisit PCM output support later
- [ ] Evaluate no-R2 flow for Grok later
- [ ] Evaluate direct binary or inline-audio response mode later
- [ ] Evaluate server-side PCM-to-WAV conversion later
- [ ] Evaluate Grok-compatible AI text enhancement later
- [ ] Add Playwright coverage for caret-sensitive mid-text editing flows that jsdom does not model faithfully

---

## Debugging and maintenance notes

### What we ended up implementing

The Grok editor work evolved beyond the original plan in a few important ways:

- the editor is Tiptap / ProseMirror based
- supported tags are represented visually as chips / wrapper boundaries
- serialization remains plain text
- normalization is handled by an append-transaction auto-convert extension
- standalone opening wrapper tags are first-class supported tokens
- unsupported tags are highlighted instead of rejected

### Shared source of truth

For future maintenance, treat `lib/tts-editor.ts` as the canonical Grok tag module.

It should own:

- raw supported instant tags
- raw supported wrapper tag pairs
- shared tag metadata definitions
- parser / serializer behavior
- constant exports reused by editor code and tests

When adding or removing a supported Grok tag in the future:

1. update the shared constants in `lib/tts-editor.ts`
2. keep editor suggestion menus derived from those shared constants
3. keep normalization logic derived from those shared constants
4. update tests that intentionally assert the supported catalog

Avoid reintroducing duplicated tag arrays in:

- editor components
- normalization extensions
- tests

Also avoid reintroducing accessor helpers that only return static tag constants. In this area, direct constant imports are the preferred pattern.

### Recommended debugging workflow

When debugging future Grok editor issues, prefer this order:

1. verify the plain-text serialization you expect
2. verify the parsed token model in `parseGrokTtsText()`
3. verify the generated Tiptap document from `grokTextToTipTapDoc()`
4. verify whether auto-convert normalization is replacing the document
5. verify whether the issue is editor rendering, serialization, or suggestion lifecycle

This helps separate:

- parser bugs
- normalization bugs
- suggestion-menu bugs
- jsdom test limitations

### Specific lessons learned

#### 1. Use structural document equality

Do not compare ProseMirror documents with `JSON.stringify()`.

Use ProseMirror structural equality instead, because JSON key ordering can produce false negatives and trigger unnecessary document replacement.

#### 2. Preserve selection through normalization

If normalization replaces the document, preserve selection by converting selection positions to text offsets and then resolving them back into document positions after replacement.

#### 3. Standalone opening wrapper tags are valid editor state

Do not flatten an unclosed supported opening wrapper tag back into plain text during parser unwind.

Treat it as a dedicated token and render it as a standalone opening boundary chip.

#### 4. Suggestion behavior is easier to test at the Tiptap layer

For suggestion lifecycle behavior, Tiptap-style tests are more reliable than browser-like key navigation in jsdom contenteditable tests.

Prefer focused suggestion tests for:

- open
- update
- close
- explicit `exitSuggestion(...)` behavior

#### 5. jsdom is not a browser for caret movement

Arrow-key and mid-text caret editing behavior inside ProseMirror contenteditable is not fully browser-faithful in jsdom.

If a bug depends on exact caret movement or DOM selection fidelity, add or prefer Playwright coverage.

### Practical debugging checklist

If a future Grok editor regression appears:

- check whether the plain-text output changed
- check whether a supported tag stopped being part of the shared tag catalog
- check whether normalization is firing on every transaction
- check whether selection restoration is moving the caret unexpectedly
- check whether a suggestion menu is reopening immediately after close
- check whether the failure is only reproducible in jsdom
- add targeted parser / normalization tests before changing editor behavior

---

## Open product decisions

The following values are now decided for the first implementation:

### 1. Grok credit pricing constant

- credits per N characters
- implemented via dedicated Grok constants in `lib/utils.ts`

### 2. Grok text length limit

- free users: 500
- paid users: 1000

### 3. Default Grok codec

- `mp3`

### 4. Whether to keep AI text enhancement for Grok

- prioritize manual advanced tagging UI
- hide AI enhancement LLM button

### 5. Grok cache key behavior

- include `model`
- exclude codec in v1 because the frontend will request only one codec

### 6. Frontend editor model

- token chips are desired
- no AST
- no validation in v1

### 7. Tag counting behavior

- tags count toward the visible character counter
- tags count toward text length validation
- tags count toward Grok billing estimate for now

### 8. Response contract

- v1 Grok integration must preserve the existing JSON response contract

---

## Recommended final behavior

When a user selects a voice whose DB row has `model = 'grok'`:

1. the existing `/api/generate-voice` route handles the request
2. the route calls xAI `/v1/tts`
3. the request sends:
   - exact user text
   - selected voice name as `voice_id`
   - normalized language
   - selected codec
4. no style prompt is applied
5. the UI exposes:
   - Grok effects control with token-chip style helpers
   - wrapping style tag insertion
   - format selector
   - no AI enhancement LLM button
6. cache keys include model
7. credits are estimated and charged from character count using Grok bucket constants
8. audio is uploaded to R2 with the correct extension and content type

This delivers Grok support while preserving the current architecture and minimizing unnecessary changes.
