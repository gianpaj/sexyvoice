-- Identify Freeloader Users (Bug Exploiters)
--
-- This query identifies users who have used more credits than they should have
-- due to a bug where credits were not being properly deducted.
--
-- Usage: Run this query in your Supabase SQL editor to identify freeloaders
-- Export the results as CSV for use with reset-freeloader-credits.ts

WITH user_credits AS (
  -- Calculate total credits received per user
  SELECT
    user_id,
    SUM(amount) FILTER (WHERE amount > 0) as total_credits_received
  FROM credit_transactions
  GROUP BY user_id
),
user_usage AS (
  -- Calculate total credits used from audio files
  SELECT
    user_id,
    SUM(credits_used) as total_credits_used,
    COUNT(*) as total_audio_files
  FROM audio_files
  GROUP BY user_id
),
current_balance AS (
  -- Get current credit balance
  SELECT
    user_id,
    amount as current_credits
  FROM credits
)
SELECT
  p.id,
  p.username,
  p.created_at,
  COALESCE(uc.total_credits_received, 0) as total_credits_received,
  COALESCE(uu.total_credits_used, 0) as total_credits_used,
  COALESCE(cb.current_credits, 0) as current_credits,
  ROUND(
    (COALESCE(uu.total_credits_used, 0)::numeric /
     NULLIF(COALESCE(uc.total_credits_received, 0), 0)::numeric * 100)::numeric,
    2
  ) as usage_percentage,
  COALESCE(uu.total_audio_files, 0) as total_audio_files
FROM profiles p
LEFT JOIN user_credits uc ON p.id = uc.user_id
LEFT JOIN user_usage uu ON p.id = uu.user_id
LEFT JOIN current_balance cb ON p.id = cb.user_id
WHERE
  -- Users who have used more credits than they received
  COALESCE(uu.total_credits_used, 0) > COALESCE(uc.total_credits_received, 0)
  -- AND still have credits remaining (exploited the bug)
  AND COALESCE(cb.current_credits, 0) > 0
ORDER BY
  usage_percentage DESC,
  total_credits_used DESC;

-- Alternative query: Include users with negative balances or suspicious patterns
-- Uncomment to use this version instead:

/*
WITH user_credits AS (
  SELECT
    user_id,
    SUM(amount) FILTER (WHERE amount > 0) as total_credits_received,
    SUM(amount) FILTER (WHERE amount < 0) as total_credits_spent
  FROM credit_transactions
  GROUP BY user_id
),
user_usage AS (
  SELECT
    user_id,
    SUM(credits_used) as total_credits_used,
    COUNT(*) as total_audio_files,
    MAX(created_at) as last_generation
  FROM audio_files
  GROUP BY user_id
),
current_balance AS (
  SELECT
    user_id,
    amount as current_credits
  FROM credits
)
SELECT
  p.id,
  p.email as username,
  p.created_at,
  COALESCE(uc.total_credits_received, 0) as total_credits_received,
  COALESCE(uu.total_credits_used, 0) as total_credits_used,
  COALESCE(cb.current_credits, 0) as current_credits,
  ROUND(
    (COALESCE(uu.total_credits_used, 0)::numeric /
     NULLIF(COALESCE(uc.total_credits_received, 0), 0)::numeric * 100)::numeric,
    2
  ) as usage_percentage,
  COALESCE(uu.total_audio_files, 0) as total_audio_files,
  uu.last_generation
FROM profiles p
LEFT JOIN user_credits uc ON p.id = uc.user_id
LEFT JOIN user_usage uu ON p.id = uu.user_id
LEFT JOIN current_balance cb ON p.id = cb.user_id
WHERE
  (
    -- Scenario 1: Used more than received
    COALESCE(uu.total_credits_used, 0) > COALESCE(uc.total_credits_received, 0)
    -- Scenario 2: Current balance is higher than it should be
    OR COALESCE(cb.current_credits, 0) > (
      COALESCE(uc.total_credits_received, 0) - COALESCE(uu.total_credits_used, 0)
    )
    -- Scenario 3: Negative calculated balance but positive current balance
    OR (
      (COALESCE(uc.total_credits_received, 0) - COALESCE(uu.total_credits_used, 0)) < 0
      AND COALESCE(cb.current_credits, 0) > 0
    )
  )
  AND COALESCE(cb.current_credits, 0) > 0  -- Only include users with credits
  AND COALESCE(uu.total_audio_files, 0) > 0  -- Must have generated at least one audio
ORDER BY
  usage_percentage DESC,
  total_credits_used DESC;
*/

-- Export instructions:
-- 1. Run this query in Supabase SQL editor
-- 2. Click "Export" button
-- 3. Choose "CSV" format
-- 4. Save as "freeloaders.csv"
-- 5. Use with: pnpm tsx scripts/reset-freeloader-credits.ts freeloaders.csv

-- Notes:
-- - usage_percentage > 100% indicates they used more than received
-- - current_credits shows what they still have (will be reset to 0)
-- - Users with 0 current_credits are automatically skipped by the script
