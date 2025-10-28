/*
  # Consolidate reference_id indexes and add NOT NULL constraint

  1. Changes:
    - Drop separate unique indexes for topup and purchase transactions
    - Create single unique index on reference_id for all transaction types
    - Add NOT NULL constraint to reference_id column

  2. Security:
    - Maintains data integrity by ensuring unique reference_ids
    - Prevents duplicate payment processing across all transaction types
*/

-- Drop the existing separate indexes for topup and purchase
DROP INDEX IF EXISTS public.unique_reference_topup_idx;
DROP INDEX IF EXISTS public.unique_reference_purchase_idx;

-- Add NOT NULL constraint to reference_id column
-- This ensures all transactions have a valid reference_id
ALTER TABLE public.credit_transactions
ALTER COLUMN reference_id SET NOT NULL;

-- Create consolidated unique index on reference_id
-- This prevents duplicate payment processing across all transaction types
CREATE UNIQUE INDEX unique_reference_id_idx
ON public.credit_transactions USING btree (reference_id);
