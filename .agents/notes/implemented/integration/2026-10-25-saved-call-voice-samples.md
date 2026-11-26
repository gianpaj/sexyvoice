# Generated samples for saved call voices

## Decision

`audio_references.sample_url` holds the R2 URL of a generated preview: MP3 for
Inworld and WAV for Mistral, named by the key's extension.
The nullable column lets profiles without a stored sample keep their provider
preview.

Both clone providers synthesize the exact English preview text using the saved
provider voice ID. The shared persistence flow uploads the sample before
inserting the profile, and cleans up the provider voice and R2 object on failure.
Sample generation is included in voice creation without a user speech-credit
deduction; it incurs provider synthesis and R2 storage costs. A zero-credit
`voice_cloning` usage event records the synthesis cost.

Samples use an unguessable object name under a prefix scoped to the profile ID.
The existing authenticated preview endpoint checks ownership before reading
the R2 object. Its URL is not included in client voice lists. R2 reads accept
only that profile's sample prefix, never arbitrary database URLs or object keys.

Account deletion removes the provider voice and stored sample, then deletes
the owned profile row. Failed deletions retain the row for support to retry
and are logged with the profile ID. Provider deletion accepts a missing voice
so retries can complete after partial cleanup.
