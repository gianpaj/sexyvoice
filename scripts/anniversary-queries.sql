-- SexyVoice Anniversary Queries
-- ========================================

-- 1. FIRST ANNIVERSARY DATE
-- SexyVoice was created on Dec 28, 2023
-- First anniversary: Dec 28, 2024
SELECT '2023-12-28'::date as first_anniversary_actual,
       '2024-12-28'::date as first_anniversary_date;


-- 2. FIRST AUDIO GENERATED (ANY USER)
SELECT 
  af.id,
  af.user_id,
  af.created_at,
  CASE 
    WHEN p.stripe_id IS NOT NULL THEN 'paid'
    ELSE 'free'
  END as user_type,
  p.username
FROM audio_files af
LEFT JOIN profiles p ON af.user_id = p.id
ORDER BY af.created_at ASC
LIMIT 1;


-- 3. FIRST AUDIO BY FREE USER
SELECT 
  af.id,
  af.user_id,
  af.created_at,
  p.username,
  v.name as voice_name
FROM audio_files af
LEFT JOIN profiles p ON af.user_id = p.id
LEFT JOIN voices v ON af.voice_id = v.id
WHERE p.stripe_id IS NULL
ORDER BY af.created_at ASC
LIMIT 1;


-- 4. FIRST AUDIO BY PAID USER
SELECT 
  af.id,
  af.user_id,
  af.created_at,
  p.username,
  p.stripe_id,
  v.name as voice_name
FROM audio_files af
LEFT JOIN profiles p ON af.user_id = p.id
LEFT JOIN voices v ON af.voice_id = v.id
WHERE p.stripe_id IS NOT NULL
ORDER BY af.created_at ASC
LIMIT 1;


-- BONUS: TIMELINE OF FIRST AUDIOS
-- See the sequence of first audio generation events
SELECT 
  af.id,
  af.user_id,
  p.username,
  af.created_at,
  CASE 
    WHEN p.stripe_id IS NOT NULL THEN 'paid'
    ELSE 'free'
  END as user_type,
  ROW_NUMBER() OVER (ORDER BY af.created_at ASC) as sequence_order
FROM audio_files af
LEFT JOIN profiles p ON af.user_id = p.id
ORDER BY af.created_at ASC
LIMIT 10;
