/*
  # Consolidate reference_id indexes

  1. Changes:
    - Drop separate unique indexes for topup and purchase types
    - Create single unique index on reference_id column
    - Add NOT NULL constraint to reference_id column
    - This ensures all transactions have a unique reference_id regardless of type
*/

-- Drop the existing type-specific unique indexes
DROP INDEX IF EXISTS unique_reference_topup_idx;
DROP INDEX IF EXISTS unique_reference_purchase_idx;

-- Add NOT NULL constraint to reference_id column
ALTER TABLE public.credit_transactions
ALTER COLUMN reference_id SET NOT NULL;

-- Create single unique index on reference_id
-- This ensures all transactions have a unique reference_id
CREATE UNIQUE INDEX unique_reference_id_idx
ON public.credit_transactions USING btree (reference_id);
