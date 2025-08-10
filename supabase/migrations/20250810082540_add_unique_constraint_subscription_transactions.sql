/*
  # Add unique constraint to prevent duplicate subscription transactions

  1. Changes:
    - Add partial unique index on (user_id, subscription_id) for purchase transactions
    - This prevents the same subscription from creating multiple credit transactions
    - Handles the race condition issue in Stripe webhook processing

  2. Notes:
    - Uses partial unique index with WHERE clause to only apply to purchase transactions
    - Allows multiple usage transactions for the same user/subscription
    - This index will prevent the duplicate subscription credits issue
*/

-- Create partial unique index to prevent duplicate subscription transactions
-- Only applies to 'purchase' type transactions to allow multiple 'usage' transactions
CREATE UNIQUE INDEX unique_user_subscription_purchase_idx
ON credit_transactions (user_id, subscription_id)
WHERE type = 'purchase' AND subscription_id IS NOT NULL;

-- Add comment for documentation
COMMENT ON INDEX unique_user_subscription_purchase_idx
IS 'Prevents duplicate purchase transactions for the same user and subscription to avoid race conditions in Stripe webhooks';
