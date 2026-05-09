-- Migration: 20260215120500_seed_predefined_characters.sql
-- Seed predefined public call characters and prompts.
--
-- This migration intentionally depends on an existing auth user.
-- If no auth users exist (e.g. local empty DB), inserts are skipped safely.

WITH admin_user AS (
  SELECT id
  FROM auth.users
  ORDER BY created_at ASC
  LIMIT 1
)
INSERT INTO public.prompts (id, user_id, is_public, type, prompt, localized_prompts)
SELECT
  '00000000-0000-4000-a000-000000000101'::uuid,
  admin_user.id,
  true,
  'call',
  'You are Ramona. Be confident, direct, and playful while staying conversational.',
  '{"en":"You are Ramona. Be confident, direct, and playful while staying conversational."}'::jsonb
FROM admin_user
ON CONFLICT (id) DO NOTHING;

WITH admin_user AS (
  SELECT id
  FROM auth.users
  ORDER BY created_at ASC
  LIMIT 1
)
INSERT INTO public.prompts (id, user_id, is_public, type, prompt, localized_prompts)
SELECT
  '00000000-0000-4000-a000-000000000102'::uuid,
  admin_user.id,
  true,
  'call',
  'You are Lily. Be warm, shy, and sweet, with short affectionate responses.',
  '{"en":"You are Lily. Be warm, shy, and sweet, with short affectionate responses."}'::jsonb
FROM admin_user
ON CONFLICT (id) DO NOTHING;

WITH admin_user AS (
  SELECT id
  FROM auth.users
  ORDER BY created_at ASC
  LIMIT 1
)
INSERT INTO public.prompts (id, user_id, is_public, type, prompt, localized_prompts)
SELECT
  '00000000-0000-4000-a000-000000000103'::uuid,
  admin_user.id,
  true,
  'call',
  'You are Milo. Be expressive, upbeat, and encouraging during the conversation.',
  '{"en":"You are Milo. Be expressive, upbeat, and encouraging during the conversation."}'::jsonb
FROM admin_user
ON CONFLICT (id) DO NOTHING;

WITH admin_user AS (
  SELECT id
  FROM auth.users
  ORDER BY created_at ASC
  LIMIT 1
)
INSERT INTO public.prompts (id, user_id, is_public, type, prompt, localized_prompts)
SELECT
  '00000000-0000-4000-a000-000000000104'::uuid,
  admin_user.id,
  true,
  'call',
  'You are Rafal. Be assertive, structured, and clear, while keeping an engaging tone.',
  '{"en":"You are Rafal. Be assertive, structured, and clear, while keeping an engaging tone."}'::jsonb
FROM admin_user
ON CONFLICT (id) DO NOTHING;

WITH admin_user AS (
  SELECT id
  FROM auth.users
  ORDER BY created_at ASC
  LIMIT 1
)
INSERT INTO public.characters (
  id,
  user_id,
  prompt_id,
  voice_id,
  is_public,
  name,
  localized_descriptions,
  session_config,
  image,
  sort_order
)
SELECT
  '00000000-0000-4000-a000-000000000201'::uuid,
  admin_user.id,
  '00000000-0000-4000-a000-000000000101'::uuid,
  (SELECT id FROM public.voices WHERE name = 'Eve' AND model = 'xai' LIMIT 1),
  true,
  'Ramona',
  '{"en":"Confident and commanding, with a playful edge."}'::jsonb,
  '{"model":"grok-4-1-fast-non-reasoning","voice":"Eve","temperature":0.8,"maxOutputTokens":null,"grokImageEnabled":false}'::jsonb,
  'ramona.webp',
  0
FROM admin_user
ON CONFLICT (id) DO NOTHING;

WITH admin_user AS (
  SELECT id
  FROM auth.users
  ORDER BY created_at ASC
  LIMIT 1
)
INSERT INTO public.characters (
  id,
  user_id,
  prompt_id,
  voice_id,
  is_public,
  name,
  localized_descriptions,
  session_config,
  image,
  sort_order
)
SELECT
  '00000000-0000-4000-a000-000000000202'::uuid,
  admin_user.id,
  '00000000-0000-4000-a000-000000000102'::uuid,
  (SELECT id FROM public.voices WHERE name = 'Ara' AND model = 'xai' LIMIT 1),
  true,
  'Lily',
  '{"en":"Soft-spoken and affectionate, with a gentle style."}'::jsonb,
  '{"model":"grok-4-1-fast-non-reasoning","voice":"Ara","temperature":0.8,"maxOutputTokens":null,"grokImageEnabled":false}'::jsonb,
  'lily.webp',
  1
FROM admin_user
ON CONFLICT (id) DO NOTHING;

WITH admin_user AS (
  SELECT id
  FROM auth.users
  ORDER BY created_at ASC
  LIMIT 1
)
INSERT INTO public.characters (
  id,
  user_id,
  prompt_id,
  voice_id,
  is_public,
  name,
  localized_descriptions,
  session_config,
  image,
  sort_order
)
SELECT
  '00000000-0000-4000-a000-000000000203'::uuid,
  admin_user.id,
  '00000000-0000-4000-a000-000000000103'::uuid,
  (SELECT id FROM public.voices WHERE name = 'Sal' AND model = 'xai' LIMIT 1),
  true,
  'Milo',
  '{"en":"Energetic and positive, always trying to keep momentum."}'::jsonb,
  '{"model":"grok-4-1-fast-non-reasoning","voice":"Sal","temperature":0.8,"maxOutputTokens":null,"grokImageEnabled":false}'::jsonb,
  'milo.webp',
  2
FROM admin_user
ON CONFLICT (id) DO NOTHING;

WITH admin_user AS (
  SELECT id
  FROM auth.users
  ORDER BY created_at ASC
  LIMIT 1
)
INSERT INTO public.characters (
  id,
  user_id,
  prompt_id,
  voice_id,
  is_public,
  name,
  localized_descriptions,
  session_config,
  image,
  sort_order
)
SELECT
  '00000000-0000-4000-a000-000000000204'::uuid,
  admin_user.id,
  '00000000-0000-4000-a000-000000000104'::uuid,
  (SELECT id FROM public.voices WHERE name = 'Rex' AND model = 'xai' LIMIT 1),
  true,
  'Rafal',
  '{"en":"Firm and disciplined, but still conversational and engaging."}'::jsonb,
  '{"model":"grok-4-1-fast-non-reasoning","voice":"Rex","temperature":0.8,"maxOutputTokens":null,"grokImageEnabled":false}'::jsonb,
  'rafal.webp',
  3
FROM admin_user
ON CONFLICT (id) DO NOTHING;
