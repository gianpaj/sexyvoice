# Inworld call voice cloning

## Decision

`CALL_CLONE_PROVIDER` chooses the provider for new saved call voices. Inworld
is the default; `mistral` retains the Mistral creation path. Ordinary dashboard
speech cloning keeps its locale-based Mistral/Chatterbox routing.

The existing `audio_references` table stores each profile's provider and voice
ID. No schema migration is required. Saved profiles select the matching call
model independently of the creation default. Reusing a Mistral voice ID with
Inworld is invalid; create a separate profile from the reference recording.

The provider-specific creation functions share persistence and compensation:
if the owner row cannot be stored, delete the newly created provider voice.
Paid access, consent, file validation, normalization, and duration checks apply
to both call cloning entry points. Inworld accepts every dashboard language
except `en-multi`, which only selects Chatterbox for one-off English clips;
`no` maps to `nb` for its API. Mistral accepts the Voxtral languages. In "Save
a voice for calls" mode the Clone page lists only the call provider's
languages, and `supportsCallCloneLocale()` enforces the same rule on the
server.

Generating with a saved Inworld voice on the Clone page takes any of those
languages, defaulting to the voice's own, and sends it as Inworld's `language`
field. Inworld TTS-2 speaks other languages natively, without the cloned
accent; speaker similarity is highest in the cloned language. A saved Mistral
voice always speaks its saved locale.

## Ownership and playback

Lists and samples accept both providers. Character and token validation
require the provider to match the selected model as well as the authenticated
owner. Provider IDs and credentials stay server-side. Preview responses are
private WAV for Mistral or MP3 for Inworld. New clone responses include the
provider so the inline creator selects the correct call mode immediately.

## Deployment and verification

Deploy SexyCall's `inworld-tts` support first, with an `INWORLD_API_KEY` that
accesses the web app's Inworld workspace. Retain Mistral credentials for its
saved profiles. User credits keep the existing behavior; clone creation does
not charge speech credits. No external API v1 contract changes are required.

Tests cover both defaults, ownership, mismatched providers, compensation,
preview formats, character saving, tokens, and the inline creator. A live
Inworld call remains necessary to assess quality, interruptions, and latency.
The browser suite requires fresh test authentication: the cached session
expired on October 22 and its refresh token is rejected. Component and API
tests cover the changed creation, saving, and model-selection flow.
