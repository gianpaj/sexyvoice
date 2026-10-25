# Call characters and custom voices

## Decisions

The call page starts with Characters and Custom tabs. Characters retain the
circular carousel and shared description. Custom exposes Built-in voices and
My voices, a link to the Clone page, and an Add a personality accordion closed
by default. A prompt and voice are required to call; a name is required to save.
Mode switches preserve the custom draft separately from selected characters.

Reusable Mistral profiles belong in `audio_references`, filtered by owner and
provider. Generated clone WAVs in R2 and `audio_files` are separate outputs;
they are not reusable provider voice IDs. Saving a profile requires explicit
consent and a paid account. Token creation rechecks ownership and provider.

`session_config.audioReferenceId` identifies a saved voice. For Mistral calls,
the LiveKit metadata voice is the reference row ID, not the provider voice ID.
The agent resolves that row with the user ID before synthesizing speech.
`characters.voice_id` retains the shared cloned-audio row because its foreign
key requires a `voices` row. The same constraint exists on `call_sessions`.

No new database schema is needed. Public character prompts remain server-side.
The working branch builds on `feat/voxtral-3-comparison` to retain Clone UI
work and Voxtral 3 support. Speech generation and existing clone credit charges
remain separate from saved-profile selection in calls.

## Implementation

The inline form replaces the creation modal. The Add circle opens Custom.
Character creation uses the shared `saveCharacter` helper; the built-in and
saved voice cards share `VoicePicker`. Character prompt resolution remains
server-side. A separate voice override for predefined characters is omitted: Custom
combines a voice with its own prompt, while predefined characters remain bundles.

The Clone page saves profiles through the existing audio normalization path,
with an included generated preview and no speech-credit charge. Provider creation,
preview upload, and the owned database insert share failure cleanup. Sample
playback uses an owner-checked private proxy. See
[stored samples](../integration/2026-10-25-saved-call-voice-samples.md).

The Clone link saves a user-scoped draft in session storage. Restoration is
validated and runs once per mount, including React Strict Mode's effect replay.
The personality accordion starts closed after returning. Selecting a built-in
voice clears both the Mistral model selector and the reference ID.

## Verification

- `pnpm fixall`, `pnpm type-check`, and `pnpm check-translations` pass.
  The worktree reuses installed dependencies with
  `--config.verify-deps-before-run=false`.
- Web Vitest: 119 files, 1,707 passed, 18 existing skips. Coverage includes
  clone consent, account gates, provider/owner filters, provider cleanup,
  private samples, token metadata, character saving, draft isolation, and
  restoration under Strict Mode.
- Call-dashboard Playwright: 17 passed on desktop/mobile, with English and
  German character creation/copy/update scenarios. The four changed creation
  and Custom scenarios also pass after modal removal.
- A browser round trip through Clone restores the prompt and selects the saved
  voice with no page errors. That check mocks clone creation. Browser checks
  use local Auth fixtures and mocked character writes/call tokens; they do not
  create live voices, write production data, or connect to LiveKit.
- The SexyCall session-record fix passes 288 Python tests with 3 existing skips.

Implementation is complete locally. Release requires the web branch and the
Mistral-enabled SexyCall branch. Real provider voice creation and a live call
remain release checks for voice quality, latency, and interruptions.
