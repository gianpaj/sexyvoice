-- Add 'card_bonus' to the credit_transaction_type enum.
-- Nothing else in this file: Postgres refuses to use an enum value in the
-- same transaction that added it, and each migration file runs in one
-- transaction, so anything that references 'card_bonus' must live in a
-- later migration.
ALTER TYPE credit_transaction_type ADD VALUE IF NOT EXISTS 'card_bonus';
