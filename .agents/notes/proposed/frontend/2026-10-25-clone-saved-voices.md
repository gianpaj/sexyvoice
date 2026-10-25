# Saved voices on the clone dashboard

## Decision

`/dashboard/clone` lists saved Inworld and Mistral profiles above the upload
and recording form. The server loads `audio_references` through the shared
owner-scoped `getSavedCallVoices()` query. Creating a saved call voice adds it
to the client list immediately. Selecting one opens the call character creator
with that voice, and previews use the private owner-checked sample endpoint.

The character creator and dashboard share voice tiles and sample playback.
Voice selection in the creator remains a radio group; the dashboard's saved
profiles are actions that open the call setup. The main call screen continues
to show characters rather than a separate voice library.

The large comparison demo card is absent from the clone form. Demo examples
belong to the public voice-cloning page; links from that page can still load
a reference into the dashboard through `initialDemo`.

Provider profiles live in the provider workspace. Supabase stores the provider
ID, owner, name, and locale. Portal-only clones and one-off speech generations
without an ownership record do not appear as saved call voices.

## Verification

Component tests cover both providers, opening a saved voice in call setup,
and showing newly saved voices immediately. The existing call creator tests
cover radio selection and preview controls shared with this list.
