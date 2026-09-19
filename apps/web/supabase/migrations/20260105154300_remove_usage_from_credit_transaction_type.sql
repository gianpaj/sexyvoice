-- =============================================================================
-- REMOVE 'usage' FROM credit_transaction_type ENUM
-- =============================================================================
-- Purpose: Remove the deprecated 'usage' type from credit_transaction_type enum
--
-- CONTEXT:
-- The 'usage' type was originally used to track credit consumption, but this
-- creates confusion with the new usage_events table. Credit transactions should
-- only record balance changes (purchases, top-ups, refunds), not consumption.
--
-- Credit consumption is now tracked in the usage_events table (append-only audit log).
-- The credit_transactions table remains the source of truth for balance changes.
--
-- BEFORE: ('purchase', 'usage', 'freemium', 'topup', 'refund')
-- AFTER:  ('purchase', 'freemium', 'topup', 'refund')
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Safety Check: Verify no transactions use 'usage' type
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  usage_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO usage_count
  FROM credit_transactions
  WHERE type::text = 'usage';

  IF usage_count > 0 THEN
    RAISE EXCEPTION 'Cannot remove ''usage'' type: % transactions still use it. Please migrate these records first.', usage_count;
  END IF;

  RAISE NOTICE 'Safety check passed: No transactions use ''usage'' type';
END $$;

-- -----------------------------------------------------------------------------
-- Step 1: Drop ALL indexes on credit_transactions table that might reference type
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  idx RECORD;
BEGIN
  FOR idx IN
    SELECT indexname
    FROM pg_indexes
    WHERE tablename = 'credit_transactions'
      AND indexdef LIKE '%type%'
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS %I', idx.indexname);
    RAISE NOTICE 'Dropped index: %', idx.indexname;
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- Step 2: Drop ALL check constraints on credit_transactions
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  con RECORD;
BEGIN
  FOR con IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'credit_transactions'::regclass
      AND contype = 'c'
  LOOP
    EXECUTE format('ALTER TABLE credit_transactions DROP CONSTRAINT IF EXISTS %I', con.conname);
    RAISE NOTICE 'Dropped constraint: %', con.conname;
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- Step 3: Drop ALL triggers on credit_transactions that might reference type
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  trg RECORD;
BEGIN
  FOR trg IN
    SELECT tgname
    FROM pg_trigger
    WHERE tgrelid = 'credit_transactions'::regclass
      AND NOT tgisinternal
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON credit_transactions', trg.tgname);
    RAISE NOTICE 'Dropped trigger: %', trg.tgname;
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- Step 4: Drop views that depend on credit_transactions
-- -----------------------------------------------------------------------------
-- (Add any known views here if they exist)

-- -----------------------------------------------------------------------------
-- Step 5: Store current column default if any, then drop it
-- -----------------------------------------------------------------------------
ALTER TABLE credit_transactions ALTER COLUMN type DROP DEFAULT;

-- -----------------------------------------------------------------------------
-- Step 6: Convert column to text using explicit cast
-- -----------------------------------------------------------------------------
ALTER TABLE credit_transactions
  ALTER COLUMN type TYPE text
  USING type::text;

-- -----------------------------------------------------------------------------
-- Step 7: Drop old enum
-- -----------------------------------------------------------------------------
DROP TYPE credit_transaction_type;

-- -----------------------------------------------------------------------------
-- Step 8: Create new enum without 'usage'
-- -----------------------------------------------------------------------------
CREATE TYPE credit_transaction_type AS ENUM (
  'purchase',
  'freemium',
  'topup',
  'refund'
);

-- -----------------------------------------------------------------------------
-- Step 9: Convert column to new enum type
-- -----------------------------------------------------------------------------
ALTER TABLE credit_transactions
  ALTER COLUMN type TYPE credit_transaction_type
  USING type::credit_transaction_type;

-- -----------------------------------------------------------------------------
-- Step 10: Add NOT NULL constraint back
-- -----------------------------------------------------------------------------
ALTER TABLE credit_transactions
  ALTER COLUMN type SET NOT NULL;

-- -----------------------------------------------------------------------------
-- Step 11: Recreate partial indexes
-- -----------------------------------------------------------------------------
-- Unique index for topup transactions using reference_id
CREATE UNIQUE INDEX IF NOT EXISTS unique_reference_topup_idx
ON credit_transactions USING btree (reference_id)
WHERE ((type = 'topup'::credit_transaction_type) AND (reference_id IS NOT NULL));

-- Unique index for subscription purchase transactions using reference_id
CREATE UNIQUE INDEX IF NOT EXISTS unique_reference_purchase_idx
ON credit_transactions USING btree (reference_id)
WHERE ((type = 'purchase'::credit_transaction_type) AND (reference_id IS NOT NULL));

-- -----------------------------------------------------------------------------
-- Step 12: Recreate check constraint for reference_id on payments
-- -----------------------------------------------------------------------------
ALTER TABLE credit_transactions
  ADD CONSTRAINT reference_id_required_for_payments
  CHECK (
    (type IN ('purchase', 'topup') AND reference_id IS NOT NULL)
    OR (type NOT IN ('purchase', 'topup'))
  );

-- -----------------------------------------------------------------------------
-- Update comments
-- -----------------------------------------------------------------------------
COMMENT ON TYPE credit_transaction_type IS
  'Types of credit balance changes: purchase (subscription), freemium (signup bonus), topup (one-time purchase), refund (credit return). Note: Credit consumption is NOT tracked here - see usage_events table instead.';

COMMENT ON COLUMN credit_transactions.type IS
  'Transaction type - only balance changes, not consumption. For consumption tracking, see usage_events table.';
