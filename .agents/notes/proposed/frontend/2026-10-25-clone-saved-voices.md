# Saved voices on the clone dashboard

## Decision

`/dashboard/clone` lists saved Inworld and Mistral profiles above the upload
and recording form. The server loads `audio_references` through the shared
owner-scoped `getSavedCallVoices()` query. Creating a saved call voice adds it
to the client list immediately. Previews use the private owner-checked sample
endpoint. Generated previews use the saved R2 WAV when `sample_url` is
populated; profiles without one retain the provider preview. See
[stored samples](../integration/2026-10-25-saved-call-voice-samples.md).

### Generating with a saved voice

Picking a saved voice makes it the speaker for the form. It replaces the
recording input, language select, consent and enhancement fields: the voice
already has a language and consent was given when it was saved. Clicking the
selected voice again, or "Use a recording instead", returns to the recording.
`/api/clone-voice` takes `savedVoiceId` instead of `file`, looks the row up by
ID and owner, and speaks with the provider voice ID:

- Inworld: `synthesizeInworldSpeech()` with `inworld-tts-2`. The non-streaming
  endpoint accepts 2,000 UTF-16 code units, so that is the text limit.
- Mistral: Voxtral with `voiceId`. Saved voices belong to paid users, so the
  paid 4,000-character limit applies.

Billing, History and caching follow one-shot clones: the clone credit rate,
an `audio_files` row and a Redis cache keyed by provider voice ID and text.
Inworld bills only synthesized characters; cloning has no listed fee. Usage
events estimate Inworld at the Builder rate, $17.50 per 1M characters.

Rejected: opening the call creator from the tile. The Clone page is where
people make speech; the call creator has its own picker.

### Deleting a saved voice

Each tile has a Delete button. The dialog names the characters that use the
voice, computed on the server from `characters.session_config.audioReferenceId`.
`DELETE /api/audio-references/[id]` deletes the provider voice and its R2
sample, then the row, through `deleteSavedVoice()`, which account deletion
also uses. A failed provider deletion keeps the row so the user can retry.

Characters keep the deleted ID. The call panel treats a saved voice that is
not in the user's list as missing: it shows "No voice" and replaces Start call
with Choose a voice, which opens the creator. `/api/call-token` already
rejects a missing voice. Detecting at read time covers every way a voice can
disappear without rewriting characters.

Rejected: blocking deletion while characters use the voice, and switching
those characters to a built-in voice without asking.

### Voice limits

Each user can keep 10 saved voices (`MAX_SAVED_CALL_VOICES`). The save path
counts the user's rows before contacting a provider and returns
`errors.savedVoiceLimitReached`. At the cap, the Clone page disables "Save a
voice for calls" and the creator disables Clone a voice; both point to
deleting one. Concurrent saves can pass the count together and exceed the cap
by one; that is acceptable for a soft limit.

Inworld voices also count against the workspace's custom voice limit, 3,000 on
Builder, shared by every user. The daily stats report shows the live count
under Calls, from `GET /voices/v1/voices` filtered to `owned = "true"`.

The Clone page microphone and call clone dialog share
`components/audio/microphone-visualizer.tsx`. Its nine frequency bands react
to the recorder's live `MediaStream`; the dialog retains its controls and timer.

The large comparison demo card is absent from the clone form. Demo examples
belong to the public voice-cloning page; links from that page can still load
a reference into the dashboard through `initialDemo`.

Provider profiles live in the provider workspace. Supabase stores the provider
ID, owner, name, and locale. Only the server writes `audio_references`: the
save path inserts through the admin client, and users can read and delete their
own rows but cannot insert or update them. Deletion and generation call the
provider with the row's `voice_id` and the server's key, so a user-written row
could delete or speak with any voice in the workspace. Portal-only clones and one-off speech generations
without an ownership record do not appear as saved call voices.

## Verification

Component tests cover generating with a selected saved voice, deleting one
with its characters named, showing newly saved voices immediately, and the
call panel's missing-voice state. Route tests cover Inworld and Mistral
generation by voice ID, the ownership 404, Inworld's text limit, and deletion
keeping the row when the provider fails. `supabase/tests/audio_references_security.test.sql` checks the `locale`
column, policies and grants against a database built from migrations. Not
checked: a real Inworld or Mistral request.
