ALTER TABLE public.characters
  ADD COLUMN IF NOT EXISTS localized_sample_urls jsonb;

ALTER TABLE public.characters
  DROP COLUMN IF EXISTS sample_url;

COMMENT ON COLUMN public.characters.localized_sample_urls IS
  'Language code to R2 URL of a preview in which the character introduces itself. Missing languages use en, then the voice sample.';

UPDATE public.characters AS c
SET localized_sample_urls = (
  SELECT jsonb_object_agg(
    lang,
    format('https://files.sexyvoice.ai/characters/%s/%s.mp3', lang, lower(c.name))
  )
  FROM unnest(ARRAY['da', 'de', 'en', 'es', 'fr', 'it']) AS lang
)
WHERE c.is_public = true
  AND c.id IN (
    '00000000-0000-4000-a000-000000000201',
    '00000000-0000-4000-a000-000000000202',
    '00000000-0000-4000-a000-000000000204'
  );
