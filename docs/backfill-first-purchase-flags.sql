-- Backfill script to retroactively add first purchase flags to existing credit_transactions
-- This script adds isFirstTopup and isFirstSubscription flags to the metadata column

-- WARNING: This is a data migration script. Test in a staging environment first.
-- Run this manually, not as part of automated migrations.

BEGIN;

-- Step 1: Set isFirstTopup = false for ALL topup transactions first
UPDATE credit_transactions
SET metadata = COALESCE(metadata, '{}'::jsonb) || '{"isFirstTopup": false}'::jsonb
WHERE type = 'topup';

-- Step 2: Set isFirstTopup = true for the first topup transaction for each user
WITH first_topups AS (
  SELECT DISTINCT ON (user_id)
    id,
    user_id
  FROM credit_transactions
  WHERE type = 'topup'
  ORDER BY user_id, created_at ASC
)
UPDATE credit_transactions ct
SET metadata = COALESCE(ct.metadata, '{}'::jsonb) || '{"isFirstTopup": true}'::jsonb
FROM first_topups ft
WHERE ct.id = ft.id;

-- Step 3: Set isFirstSubscription = false for ALL subscription transactions first
UPDATE credit_transactions
SET metadata = COALESCE(metadata, '{}'::jsonb) || '{"isFirstSubscription": false}'::jsonb
WHERE type = 'purchase';

-- Step 4: Set isFirstSubscription = true for the first subscription purchase for each user
WITH first_subscriptions AS (
  SELECT DISTINCT ON (user_id)
    id,
    user_id
  FROM credit_transactions
  WHERE type = 'purchase'
  ORDER BY user_id, created_at ASC
)
UPDATE credit_transactions ct
SET metadata = COALESCE(ct.metadata, '{}'::jsonb) || '{"isFirstSubscription": true}'::jsonb
FROM first_subscriptions fs
WHERE ct.id = fs.id;

COMMIT;

-- Verification queries (run these after the migration)

-- Count records with first purchase flags
SELECT
  COUNT(*) FILTER (WHERE type = 'topup' AND metadata->>'isFirstTopup' = 'true') as first_topups,
  COUNT(*) FILTER (WHERE type = 'topup' AND metadata->>'isFirstTopup' = 'false') as non_first_topups,
  COUNT(*) FILTER (WHERE type = 'purchase' AND metadata->>'isFirstSubscription' = 'true') as first_subscriptions,
  COUNT(*) FILTER (WHERE type = 'purchase' AND metadata->>'isFirstSubscription' = 'false') as non_first_subscriptions
FROM credit_transactions;

-- Show first purchases per user (sample)
SELECT
  user_id,
  type,
  created_at,
  metadata->>'isFirstTopup' as is_first_topup,
  metadata->>'isFirstSubscription' as is_first_subscription,
  metadata->>'dollarAmount' as dollar_amount
FROM credit_transactions
WHERE type IN ('topup', 'purchase')
ORDER BY user_id, created_at
LIMIT 30;

-- Verify no duplicate first purchases per user
SELECT
  user_id,
  COUNT(*) FILTER (WHERE metadata->>'isFirstTopup' = 'true') as first_topup_count,
  COUNT(*) FILTER (WHERE metadata->>'isFirstSubscription' = 'true') as first_subscription_count
FROM credit_transactions
GROUP BY user_id
HAVING
  COUNT(*) FILTER (WHERE metadata->>'isFirstTopup' = 'true') > 1
  OR COUNT(*) FILTER (WHERE metadata->>'isFirstSubscription' = 'true') > 1;

-- Expected: No rows returned (each user should have max 1 first purchase of each type)

-- Example: Find users who made a topup before a subscription
SELECT DISTINCT
  ct1.user_id,
  ct1.created_at as first_topup_date,
  ct2.created_at as first_subscription_date,
  ct2.created_at - ct1.created_at as time_between
FROM credit_transactions ct1
LEFT JOIN credit_transactions ct2
  ON ct1.user_id = ct2.user_id
  AND ct2.metadata->>'isFirstSubscription' = 'true'
WHERE ct1.metadata->>'isFirstTopup' = 'true'
  AND ct2.id IS NOT NULL
ORDER BY time_between DESC
LIMIT 10;

-- Rollback script (if needed)
/*
BEGIN;

-- Remove isFirstTopup flags
UPDATE credit_transactions
SET metadata = metadata - 'isFirstTopup'
WHERE metadata ? 'isFirstTopup';

-- Remove isFirstSubscription flags
UPDATE credit_transactions
SET metadata = metadata - 'isFirstSubscription'
WHERE metadata ? 'isFirstSubscription';

COMMIT;
*/
