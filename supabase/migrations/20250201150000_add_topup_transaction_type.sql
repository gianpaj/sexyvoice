-- Add 'topup' to the credit_transaction_type enum
DO $$
BEGIN
    -- Add the new enum value if it doesn't exist
    IF EXISTS (
        SELECT 1 FROM pg_type
        WHERE typname = 'credit_transaction_type'
    ) AND NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'credit_transaction_type')
        AND enumlabel = 'topup'
    ) THEN
        ALTER TYPE credit_transaction_type ADD VALUE 'topup';
    END IF;
END
$$;

-- Add reference_id column to store payment intent ID or session ID
ALTER TABLE credit_transactions
ADD COLUMN IF NOT EXISTS reference_id TEXT;

-- Add metadata column to store additional data like priceId, dollarAmount
ALTER TABLE credit_transactions
ADD COLUMN IF NOT EXISTS metadata JSONB;

-- Add index for reference_id for faster lookups
CREATE INDEX IF NOT EXISTS credit_transactions_reference_id_idx ON credit_transactions(reference_id);

-- Add index for metadata for JSONB queries
CREATE INDEX IF NOT EXISTS credit_transactions_metadata_idx ON credit_transactions USING gin(metadata);
