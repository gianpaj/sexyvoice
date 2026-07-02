# Inworld voice option on the Call page

## Context

Voice calls currently always use the Grok realtime model (`grok-voice-think-fast-1.0`),
fixed in `data/default-config.ts` with **no engine/model selector** in the UI. We want an
optional **engine dropdown** so a (paid) user can pick **Inworld** instead of Grok. When
Inworld is selected, the user picks a saved cloned voice **or uploads a sample to mint one**,
and the call is started with model `inworld-realtime` and the chosen `audio_references` id
sent to `/api/call-token`, which resolves it to the Inworld `voice_id` for the agent.

This builds on the just-shipped `audio_references` table + `/api/audio-references` +
`lib/clone/inworld.ts` (`createInworldVoice`, `deleteInworldVoice`).

### Confirmed decisions
1. **Upload (clone-only) + select.** Add a clone-only endpoint that mints an Inworld voice
   from an uploaded sample (no text/synthesis), plus reuse the saved-voice dropdown.
2. **Paid users only** for the Inworld engine (mirror `hasUserPaid` gate).
3. Model sent is **`inworld-realtime`** via `playgroundState.sessionConfig`.

### Out of scope (flag clearly)
The LiveKit agent worker (`sexycall`) that consumes `metadata.model === 'inworld-realtime'` +
the Inworld `voice_id` lives **outside this repo** and must be updated separately. This PR only
covers the web UI, schema, and token route passing the right metadata through.

## Plan

### 1. Model + schema + session config
- `data/models.ts`: add `INWORLD_REALTIME: 'inworld-realtime'` to `ModelId`.
- `data/session-config.ts`: add `audioReferenceId?: string | null` to `SessionConfig`.
- `data/default-config.ts`: default `audioReferenceId: null`.
- `lib/call-token-schema.ts`: add `audioReferenceId: z.string().nullable().optional()` to
  `sessionConfigSchema` (keep `model: z.string()`, `voice` stays required — client sends the
  existing default voice for Inworld; the route ignores it).

### 2. Clone-only endpoint — `POST /api/audio-references` (add to existing route file)
`apps/web/app/api/audio-references/route.ts` currently only has `GET`. Add `POST`:
- Auth → `hasUserPaid(user.id)` (403 if not paid).
- multipart form: `file`, `name`, `locale`. Validate locale via `isInworldSupportedLocale`,
  name length (≤60), file type/size (reuse `ALLOWED_TYPES`/`CLONING_FILE_MAX_SIZE` constants).
- Normalize to WAV + trim to Inworld's 3–15s window by reusing `@/lib/audio-converter`
  (`needsConversion`, `isConversionSupported`, `convertToWav`, `trimWavBuffer`) and
  `@/lib/audio` `getAudioDuration` — the same primitives `clone-voice/route.ts` uses (extract a
  small `prepareInworldReferenceAudio(buffer, mimeType, filename)` helper into
  `lib/clone/inworld.ts` so both call sites share it; keep the existing clone route working).
- `createInworldVoice({ displayName: name, locale, referenceAudioBuffer })` →
  `insertAudioReference({ userId, provider:'inworld', voiceId, name, isPaid:true })`; roll back
  via `deleteInworldVoice` if the insert fails (same pattern as the clone route). Return the row.
- Map Inworld errors with the same 4xx-vs-5xx logic (reuse/extract the mapping if convenient).

### 3. `/api/call-token` route — Inworld branch
In `apps/web/app/api/call-token/route.ts`, where `voice` is resolved (~line 134):
- Pull `audioReferenceId` out of `sessionConfig`.
- If `model === ModelId.INWORLD_REALTIME`:
  - Require `hasUserPaid(user.id)` (403 if not) — reuse the existing `isPaidUser` memo.
  - Require `audioReferenceId`; `getAudioReferenceById(audioReferenceId, user.id)` (404 if
    missing/not owned); set `resolvedVoiceId = row.voice_id` and **skip** `getVoiceIdByName`.
- Else: existing Grok path (`getVoiceIdByName(voice)` → `voiceObj.id`).
- `metadata.voice = resolvedVoiceId` and `metadata.model = model` (unchanged downstream shape).

### 4. Front-end — engine dropdown + Inworld voice picker
- **`CloneInworldVoiceSelect` reuse:** refactor it to be dispatch-agnostic — props
  `value` + `onChange(id)` + `onVoiceDeleted` (instead of `dispatch`/`selectedAudioReferenceId`).
  Update the existing clone page (`new.client.tsx`) call site to pass callbacks. This makes it
  reusable on the Call page. (Files:
  `app/[lang]/(dashboard)/dashboard/clone/clone-inworld-voice-select.tsx`, `new.client.tsx`.)
- **Engine selector** in `components/call/configuration-form.tsx`: an "Engine" `Select`
  (Grok default; **Inworld option only enabled for paid users**). On change dispatch
  `SET_SESSION_CONFIG` with `model` (+ reset `audioReferenceId` to null when switching to Grok).
- **Inworld voice section** (new `components/call/inworld-voice-section.tsx`), rendered only
  when `model === INWORLD_REALTIME`:
  - Fetch saved voices (`GET /api/audio-references?provider=inworld`) with the
    fetch+useEffect pattern; render the reused `CloneInworldVoiceSelect` bound to
    `sessionConfig.audioReferenceId` (dispatch `SET_SESSION_CONFIG { audioReferenceId }`),
    with delete.
  - An "upload new" control (name + file/mic) using the same `useFileUpload` + `useFFmpeg`
    hooks the clone page uses; on submit POST `/api/audio-references` (multipart) → on success
    refresh the list and auto-select the new voice.
- **Gating connect:** when `model === INWORLD_REALTIME` and no `audioReferenceId`, disable the
  Connect action (in the preset/connect control) and surface a hint.
- **Reconnect on voice change:** add `audioReferenceId` to `RECONNECT_REQUIRED_FIELDS` /
  the change-detection in `configuration-form.tsx` so switching the saved voice re-mints the
  token (server re-resolves `voice_id`); the Grok hot-reload RPC path is untouched.

### 5. i18n + tests
- Add `call` namespace strings (engine label, Grok/Inworld options, "upload voice", name
  label, paid-only hint, "select a voice to start") across all 6 `messages/*.json`; keep
  `check-translations` green.
- Tests:
  - `tests/call-token.test.ts`: `model=inworld-realtime` + `audioReferenceId` resolves via
    `getAudioReferenceById` and puts `voice_id` in metadata; 403 when not paid; 404 when the
    reference is missing; Grok path unchanged.
  - `tests/audio-references.test.ts`: `POST` mints a voice (paid) → `createInworldVoice`
    (MSW) + `insertAudioReference`; 403 when not paid; rollback when insert fails.
  - Reuse existing `setup.ts` mocks (`getAudioReferenceById`, `insertAudioReference`,
    `hasUserPaid`, Inworld MSW handlers).

## Files to touch
- **New:** `app/api/audio-references/route.ts` (`POST` added),
  `components/call/inworld-voice-section.tsx`
- **Edit:** `data/models.ts`, `data/session-config.ts`, `data/default-config.ts`,
  `lib/call-token-schema.ts`, `lib/clone/inworld.ts` (shared audio-prep helper),
  `app/api/call-token/route.ts`,
  `components/call/configuration-form.tsx`,
  `app/[lang]/(dashboard)/dashboard/clone/{clone-inworld-voice-select.tsx,new.client.tsx}`,
  `messages/*.json`, `tests/call-token.test.ts`, `tests/audio-references.test.ts`

## Verification
1. `pnpm type-check`; biome on changed files; `pnpm check-translations`.
2. `vitest run tests/call-token.test.ts tests/audio-references.test.ts` green; full suite green.
3. Manual (paid user, real `INWORLD_API_KEY`, migration applied): on the Call page pick
   **Inworld** → upload a 5–15s sample + name → voice appears and is selected → Connect sends
   `model=inworld-realtime` + the voice's `voice_id` in the token metadata (verify via network/
   server log). Pick an existing voice and delete one. Confirm Grok calls are unchanged.

## Open items / notes
- **Agent worker** must be updated out-of-repo to handle `inworld-realtime` + the Inworld
  `voice_id`; until then calls will dispatch but the agent won't synthesize via Inworld.
- Credits: calls still bill via the existing per-minute model (unchanged); Inworld realtime
  cost reconciliation is a separate concern.
