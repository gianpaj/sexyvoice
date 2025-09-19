/*
  # Fix subscription payment indexes for recurring payments

  1. Changes:
    - Drop existing problematic unique indexes
    - Create new unique indexes that allow recurring subscription payments
    - Use reference_id (payment_intent) as unique identifier for subscription payments
*/

-- Drop the existing problematic indexes
DROP INDEX IF EXISTS unique_user_subscription_purchase_idx;
DROP INDEX IF EXISTS unique_user_reference_topup_idx;

-- Create new unique index for topup transactions using reference_id
-- This allows multiple topups per user as long as each has a unique reference_id (payment_intent)
CREATE UNIQUE INDEX unique_reference_topup_idx
ON public.credit_transactions USING btree (reference_id)
WHERE ((type = 'topup'::credit_transaction_type) AND (reference_id IS NOT NULL));

-- Create new unique index for subscription purchase transactions using reference_id
-- This allows recurring subscription payments as each payment has a unique payment_intent
CREATE UNIQUE INDEX unique_reference_purchase_idx
ON public.credit_transactions USING btree (reference_id)
WHERE ((type = 'purchase'::credit_transaction_type) AND (reference_id IS NOT NULL));

-- Optional: Create a non-unique index on subscription_id for query performance
-- This allows multiple payments per subscription (which is what we want for recurring payments)
CREATE INDEX credit_transactions_subscription_id_idx
ON public.credit_transactions USING btree (subscription_id)
WHERE (subscription_id IS NOT NULL);
