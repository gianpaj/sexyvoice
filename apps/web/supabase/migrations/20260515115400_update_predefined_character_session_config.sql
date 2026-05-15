-- Update legacy predefined call character session configs for the Grok Voice model.
-- Also remove the deprecated grokImageEnabled JSON key from existing rows.
UPDATE public.characters
SET session_config = jsonb_set(
  session_config - 'grokImageEnabled',
  '{model}',
  '"grok-voice-think-fast-1.0"'::jsonb,
  true
)
WHERE id IN (
  '00000000-0000-4000-a000-000000000201'::uuid,
  '00000000-0000-4000-a000-000000000202'::uuid,
  '00000000-0000-4000-a000-000000000203'::uuid,
  '00000000-0000-4000-a000-000000000204'::uuid
)
AND is_public = true;
