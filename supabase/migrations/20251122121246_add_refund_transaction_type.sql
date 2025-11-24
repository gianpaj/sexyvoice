-- Add 'refund' to the credit_transaction_type enum
ALTER TYPE credit_transaction_type ADD VALUE IF NOT EXISTS 'refund';
