# Call page redesign

Source: the "Voice Characters UX" Claude Design
(`https://claude.ai/artifact/XMZwBHn8Si6VTWFH1yVjwC`). It is a public artifact
from outside the organization. Its 21 boards are states of one prototype,
`project/Main.dc.html`, selected by a `start` prop.

## Design summary

- Picker: "Your characters" grid (dashed Create card first) and a "Featured"
  grid. Each card has an avatar, name, tagline, Listen pill and Call button.
  Own cards add an overflow menu: Edit, Duplicate, Delete.
- Call panel: right sheet on desktop, bottom sheet on phones. It shows the
  character, its voice with Listen, Language, Scene and microphone status,
  then Start call. Featured characters offer "Make your own version"; own
  characters offer Edit and Delete. A blocked microphone shows a fix-it box.
- Creator: three numbered sections (Who is it?, Personality with example
  chips, Voice tiles with Your voices, Clone a voice and Built-in), a sticky
  preview card on desktop, and a sticky footer with a hint and Save.
  Leaving with changes asks to discard.
- Clone modal: Record or Upload, then Name and consent, then Ready.
- In call: large avatar, status, timer, Mute and End. Ended: Call again,
  Edit (own) or Make your own version (featured), Back to characters.
- Toasts: saved, deleted with Undo, example replaced text with Undo.

## Decisions

- Map the design's hex colors to Tailwind tokens. The site is dark-only and
  already uses Inter.
- Featured "Make your own version" copies the name, tagline and voice, but
  never the prompt. Public prompts stay server-side (AGENTS.md rule).
- No avatar color or picture upload. `characters` has no color column, and
  image upload needs storage. Initials get a stable color from the ID.
- Characters are saved before calling. The design has no unsaved custom
  call. This replaces the Characters/Custom tabs and the custom draft state.
- Delete is deferred while its Undo toast is visible. The DELETE request is
  sent when the toast closes or the page hides.
- During a call nothing is editable, so the live `pg.updateConfig` RPC and
  the reconnect-on-voice-change path in the old configuration form go away.
- Only one sample plays at a time (a shared sample player).

## Plan (one commit each)

1. Picker, character cards and call panel. They replace the carousel, the
   tabs and the configuration form.
2. Creator with personality examples and the voice tile picker. It replaces
   the custom form, preset save and instructions editor.
3. In-call and ended views. They replace Chat, ConnectButton and
   SessionControls.
4. Clone-a-voice modal, built on the existing `/api/clone-voice` save-only
   path.
5. Remove the unused state, components and messages. Update the unit and e2e
   tests.

## Learnings

- `/api/clone-voice` with `saveVoiceName` and `voiceConsent` saves a Mistral
  profile and returns `audioReferenceId`. It needs a paid account and a
  Voxtral locale, and does not charge credits.
- `connect()` builds the token request from `pgState`, so the panel only
  needs `selectPreset(id)` before it calls `connect()`.
