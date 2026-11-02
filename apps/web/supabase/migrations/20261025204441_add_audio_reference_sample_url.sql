ALTER TABLE public.audio_references
  ADD COLUMN sample_url text;

COMMENT ON COLUMN public.audio_references.sample_url IS
  'R2 URL of the generated call voice preview; NULL uses the provider preview';
