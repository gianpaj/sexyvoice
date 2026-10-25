# Call page redesign

Source: the "Voice Characters UX" Claude Design
(`https://claude.ai/artifact/XMZwBHn8Si6VTWFH1yVjwC`). It is a public artifact
from outside the organization. Its 21 boards are states of one prototype,
`project/Main.dc.html`, selected by a `start` prop. The prototype's header and
`[Site name]` placeholder are not used; the dashboard layout stays.

This replaces the Characters/Custom call UI in
[call characters and custom voices](../../proposed/frontend/2026-10-21-call-custom-voices.md).
Saved voices are owned provider profiles in `audio_references`; see
[saved call voices](../../../../ARCHITECTURE.md#saved-voices-for-calls).

## What changed

- `components/call/call-experience.tsx` owns the screens: picker, creator,
  in call and ended. The call panel is a sheet on top of them.
- Picker: "Your characters" (Create card first, Upgrade card for free users)
  and "Featured" grids of `character-card.tsx`. Own cards have an Edit,
  Duplicate and Delete menu.
- `call-panel.tsx`: voice with Listen, language, scene (restyled
  `scene-selector.tsx`), microphone status, Start call, then Edit/Delete or
  "Make your own version". It is a bottom sheet below 768px.
- `character-creator.tsx`: Who is it?, Personality with five examples, Voice
  (`voice-picker.tsx` tiles), a desktop preview, a sticky save bar and a
  discard confirmation.
- `clone-voice-dialog.tsx`: Record or Upload, Name and consent, Ready.
- `in-call-view.tsx` and `call-ended-view.tsx` replace Chat, ConnectButton and
  SessionControls. The input-device and Krisp menu moved into the in-call view.
- Removed: configuration form and schema, preset selector, preset save,
  instructions editor, custom character form, session config, voice play
  button, `lib/call-draft.ts`, and the Characters/Custom mode in the
  playground state. About 70 unused `call.*` messages were removed.

## Decisions

- Design hex colors map to Tailwind slate/violet classes. The site is
  dark-only and already uses Inter.
- "Make your own version" copies the name, description and voice, never the
  prompt. Public prompts stay server-side.
- No avatar color picker or picture upload. `characters` has no color column,
  and uploads need storage. Initials take a stable color from the ID.
- Characters are saved before calling; the design has no unsaved custom call.
  So the pre-connect save in `connect()`, the live `pg.updateConfig` RPC and
  the reconnect-on-voice-change path are gone; nothing is editable mid-call.
- `selectPreset` always reloads the preset now. Its old guard protected
  unsaved inline edits, which no longer exist, and the reload picks up a
  character that was just saved.
- Deletes wait for the Undo toast to close (`onAutoClose`/`onDismiss`), not a
  separate timer, because sonner pauses on hover. `pagehide` and unmount send
  pending deletes with `keepalive`.
- The clone consent uses the Clone page's legal text
  (`clone.legalConsentCheckbox`), not the design's shorter line. The help text
  says the provider keeps the sample.
- Saved voices use the call language when Voxtral supports it, else English.
- Closing the clone dialog while it saves does not abort: the server finishes
  the save either way, so the request runs on and the voice is listed.
- Edits and duplicates build on the source character's localized prompts and
  descriptions. Only an English edit replaces the default prompt.
- When LiveKit drops a room by itself, the page calls `disconnect()`; only
  that clears `shouldConnect`.
- Opening the creator sends pending deletes first, because the API counts
  characters awaiting deletion against the limit of 10.
- One shared sample player (`hooks/use-sample-player.tsx`) stops the previous
  sample when another starts.

## Learnings

- `tsconfig.tsbuildinfo` can hide new keys in `messages/en.json` from typed
  `next-intl` checks. Delete it if `tsc` reports a key that exists.
- `apps/web/e2e` is excluded from `tsconfig.json`; run Playwright to catch
  broken spec references.
- `useMediaRecorder` threw from an effect when `MediaRecorder` was missing,
  which unmounted the page. It now reports through `onError`.
- Biome flags a `biome-ignore` placed above a JSX expression rather than the
  element; put it directly above the element.
- `useMediaRecorder` sets status `failed` on a blocked microphone without
  calling `onError`; read the status.
- Its `onStop` fires after a deliberate stop's state reset, so a discarded
  take needs a flag to be ignored.
- `next dev` writes untracked `apps/web/AGENTS.md` and `apps/web/CLAUDE.md`;
  they are not part of this work.
- `.env.local` points at the hosted Supabase project, so browser checks must
  mock `/api/characters` and `/api/clone-voice` writes, as the e2e spec does.

## Not done

- Avatar color or picture per character (needs schema and storage).
- A greeting preview in the character's voice; Listen plays the voice sample.
- `useCallTimer` restarts at zero after a LiveKit reconnect, so the ended
  screen shows only the last stretch of such a call.

## Verification

See the commit series on `feat/voxtral-3-comparison` starting at `25e681fb`.

- `pnpm fixall`, `pnpm type-check` and `pnpm check-translations` pass.
- Web Vitest: 123 files, 1,805 passed, 18 existing skips.
- An independent review of the diff found eight issues; all are fixed in
  `35e971ac`.
- Call Playwright (chromium, E2E mode, mocked writes): 13 passed, including
  English and German create/duplicate/edit, delete with Undo, and desktop and
  mobile screenshots of picker, panel, creator and clone dialog.
- Not checked: a live LiveKit call, real voice cloning, or the in-call and
  ended views in a browser (covered by unit tests only).
