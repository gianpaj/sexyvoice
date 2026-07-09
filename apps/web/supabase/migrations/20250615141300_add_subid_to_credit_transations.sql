/*
  # Add subscription_id column to credit_transactions table

  1. Changes:
    - Add subscription_id column as TEXT
*/

-- Add subscription_id column with default value
ALTER TABLE credit_transactions
ADD COLUMN subscription_id TEXT;
