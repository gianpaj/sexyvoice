-- Saved voices store the language they were cloned in. Production already has
-- this column, so the migration only aligns databases built from migrations.
ALTER TABLE public.audio_references
  ADD COLUMN IF NOT EXISTS locale text;

COMMENT ON COLUMN public.audio_references.locale IS
  'Language of the reference recording, used as the default synthesis locale';
