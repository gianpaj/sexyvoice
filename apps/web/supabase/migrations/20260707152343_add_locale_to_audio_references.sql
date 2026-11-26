-- Store the clone-time locale for reusable provider voices.
-- Existing rows predate this field, so keep it nullable and let the app fall
-- back to the request locale for those legacy references.
ALTER TABLE public.audio_references
  ADD COLUMN locale text;

COMMENT ON COLUMN public.audio_references.locale IS
  'Clone-time locale/langCode binding for provider-side voices.';
