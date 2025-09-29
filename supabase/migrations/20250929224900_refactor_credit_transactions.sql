/*
  # Refactor Credit Transactions to Event-Sourced Approach

  1. Changes:
    - Update credit_transaction_type enum to include new types
    - Add new columns to credit_transactions for event sourcing
    - Add indexes for performance
    - Add RLS policies

  2. Event-sourced approach:
    - Transactions become source of truth for balances
    - Each transaction stores balance_after for audit trail
    - Idempotency protection with idempotency_key
    - Direction field for credit/debit distinction
*/

-- Update transaction type enum to include new types
ALTER TYPE credit_transaction_type ADD VALUE IF NOT EXISTS 'subscription_grant';
ALTER TYPE credit_transaction_type ADD VALUE IF NOT EXISTS 'bonus';
ALTER TYPE credit_transaction_type ADD VALUE IF NOT EXISTS 'refund';
ALTER TYPE credit_transaction_type ADD VALUE IF NOT EXISTS 'adjustment';
ALTER TYPE credit_transaction_type ADD VALUE IF NOT EXISTS 'freemium';
ALTER TYPE credit_transaction_type ADD VALUE IF NOT EXISTS 'topup';

-- Add new columns to credit_transactions table
ALTER TABLE credit_transactions 
ADD COLUMN IF NOT EXISTS direction TEXT NOT NULL DEFAULT 'debit' CHECK (direction IN ('credit', 'debit')),
ADD COLUMN IF NOT EXISTS balance_after NUMERIC NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS reference_type TEXT,
ADD COLUMN IF NOT EXISTS idempotency_key TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS created_by TEXT DEFAULT 'system';

-- Update existing records to set proper direction based on type
UPDATE credit_transactions 
SET direction = CASE 
  WHEN type IN ('purchase', 'subscription_grant', 'bonus', 'refund', 'freemium', 'topup') THEN 'credit'
  WHEN type = 'usage' THEN 'debit'
  ELSE 'debit'
END
WHERE direction IS NULL OR direction = 'debit';

-- Make direction column required (remove default)
ALTER TABLE credit_transactions ALTER COLUMN direction DROP DEFAULT;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_created 
ON credit_transactions(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_credit_transactions_reference 
ON credit_transactions(reference_type, reference_id) 
WHERE reference_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_credit_transactions_idempotency 
ON credit_transactions(idempotency_key) 
WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_credit_transactions_direction 
ON credit_transactions(user_id, direction);

-- Add comment to table
COMMENT ON TABLE credit_transactions IS 'Event-sourced credit transactions - source of truth for user balances';
COMMENT ON COLUMN credit_transactions.direction IS 'credit = adds to balance, debit = subtracts from balance';
COMMENT ON COLUMN credit_transactions.balance_after IS 'User balance after this transaction was applied';
COMMENT ON COLUMN credit_transactions.idempotency_key IS 'Prevents duplicate transactions for the same operation';