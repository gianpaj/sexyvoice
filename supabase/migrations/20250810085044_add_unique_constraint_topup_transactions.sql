/*
  # Add unique constraint for topup transactions

  1. Changes:
    - Add partial unique index on (user_id, reference_id) for topup transactions
    - This prevents the same payment intent from creating multiple credit transactions
    - Handles race conditions in Stripe webhook processing for one-time payments

  2. Notes:
    - Uses partial unique index with WHERE clause to only apply to topup transactions
    - Prevents duplicate topup transactions with the same reference_id (payment intent)
    - Allows multiple purchase transactions since they use subscription_id instead
    - Only applies when reference_id IS NOT NULL to avoid affecting other transaction types
*/

-- Create partial unique index to prevent duplicate topup transactions
-- Only applies to 'topup' type transactions to prevent same payment intent from being processed multiple times
CREATE UNIQUE INDEX unique_user_reference_topup_idx
ON credit_transactions (user_id, reference_id)
WHERE type = 'topup' AND reference_id IS NOT NULL;

-- Add comment for documentation
COMMENT ON INDEX unique_user_reference_topup_idx
IS 'Prevents duplicate topup transactions for the same user and payment intent to avoid race conditions in Stripe webhooks';
