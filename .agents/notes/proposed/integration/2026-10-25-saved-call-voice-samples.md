# Generated samples for saved call voices

## Decision

`audio_references.sample_url` holds the R2 URL of a generated WAV preview.
The nullable column lets profiles without a stored sample keep their provider
preview. The migration is prepared for the user to apply; agents must not
apply it. Checked-in database types include this pending column.

Both clone providers synthesize the exact English preview text using the saved
provider voice ID. The shared persistence flow uploads the sample before
inserting the profile, and cleans up the provider voice and R2 object on failure.
Sample generation is included in voice creation without a user speech-credit
deduction; it incurs provider synthesis and R2 storage costs.

Samples use an unguessable object name under a prefix scoped to the profile ID.
The existing authenticated preview endpoint checks ownership before reading
the R2 object. Its URL is not included in client voice lists. R2 reads accept
only that profile's sample prefix, never arbitrary database URLs or object keys.

## Verification and rollout

Apply `20261025204441_add_audio_reference_sample_url.sql` before deploying the
sample creation code. Database tests require the pending migration and are
deferred until it is applied. No schema changes have been applied by this task.
