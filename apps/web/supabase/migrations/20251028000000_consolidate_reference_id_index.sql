/*
  # Consolidate reference_id indexes and add conditional NOT NULL constraint

  1. Changes:
    - Drop separate unique indexes for topup and purchase transactions
    - Create single unique index on reference_id for 'purchase' and 'topup' types only
    - Add NOT NULL constraint to reference_id column for 'purchase' and 'topup' types
    - Other transaction types (usage, freemium) can have NULL reference_id

  2. Security:
    - Maintains data integrity by ensuring unique reference_ids for payment transactions
    - Prevents duplicate payment processing for 'purchase' and 'topup' transaction types
*/

-- Drop the existing separate indexes for topup and purchase
DROP INDEX IF EXISTS public.unique_reference_topup_idx;
DROP INDEX IF EXISTS public.unique_reference_purchase_idx;

-- Add CHECK constraint to ensure reference_id is NOT NULL for purchase and topup types
-- This allows other transaction types (usage, freemium) to have NULL reference_id
ALTER TABLE public.credit_transactions
ADD CONSTRAINT reference_id_required_for_payments
CHECK (
  (type IN ('purchase', 'topup') AND reference_id IS NOT NULL)
  OR
  (type NOT IN ('purchase', 'topup'))
);

-- Create consolidated unique index on reference_id for purchase and topup types only
-- This prevents duplicate payment processing for payment-related transactions
-- Partial index excludes rows where reference_id is NULL (for other transaction types)
CREATE UNIQUE INDEX unique_reference_id_idx
ON public.credit_transactions USING btree (reference_id)
-- The `AND reference_id IS NOT NULL` part is a _filter condition_ (part of the `WHERE` clause), not a constraint that enforces NOT NULL.
WHERE (type IN ('purchase', 'topup') AND reference_id IS NOT NULL);
