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
The implementation builds on `feat/voxtral-3-comparison` to retain Clone UI
work and Voxtral 3 support. Speech generation and existing clone credit charges
remain separate from saved-profile selection in calls.

## Verification

Implementation and validation are in progress.
