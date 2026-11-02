ALTER TABLE public.characters
  ADD COLUMN IF NOT EXISTS sample_url text;

COMMENT ON COLUMN public.characters.sample_url IS
  'R2 URL of a preview in which the character introduces itself; NULL uses the voice sample';

UPDATE public.characters
SET sample_url = 'https://files.sexyvoice.ai/characters/lily.mp3'
WHERE id = '00000000-0000-4000-a000-000000000202' AND is_public = true;

UPDATE public.characters
SET sample_url = 'https://files.sexyvoice.ai/characters/ramona.mp3'
WHERE id = '00000000-0000-4000-a000-000000000201' AND is_public = true;

UPDATE public.characters
SET sample_url = 'https://files.sexyvoice.ai/characters/rafal.mp3'
WHERE id = '00000000-0000-4000-a000-000000000204' AND is_public = true;
