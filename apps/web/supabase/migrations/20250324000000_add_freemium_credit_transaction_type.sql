-- This migration adds 'freemium' to the credit_transaction_type enum
-- Assuming credit_transaction_type is an existing enum type

-- First, check if the enum type exists and 'freemium' is not already a value
DO $$
BEGIN
    -- Add the new enum value if it doesn't exist
    IF EXISTS (
        SELECT 1 FROM pg_type 
        WHERE typname = 'credit_transaction_type'
    ) AND NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'credit_transaction_type')
        AND enumlabel = 'freemium'
    ) THEN
        ALTER TYPE credit_transaction_type ADD VALUE 'freemium';
    END IF;
END
$$;
