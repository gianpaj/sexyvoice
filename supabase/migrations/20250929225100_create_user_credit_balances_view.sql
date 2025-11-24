/*
  # Create materialized view for fast balance lookups

  1. Creates materialized view user_credit_balances
  2. Computes current balance from all credit transactions
  3. Includes helpful metadata like last transaction date
  4. Can be refreshed periodically for performance

  Note: This is optional but recommended for performance.
  For real-time accuracy, compute balance from transactions directly.
*/

-- Create materialized view for fast balance lookups
CREATE MATERIALIZED VIEW IF NOT EXISTS user_credit_balances AS
SELECT
  user_id,
  SUM(CASE
    WHEN direction = 'credit' THEN amount
    WHEN direction = 'debit' THEN -amount
  END) as balance,
  MAX(created_at) as last_transaction_at,
  COUNT(*) as transaction_count,
  SUM(CASE WHEN direction = 'credit' THEN amount ELSE 0 END) as total_earned,
  SUM(CASE WHEN direction = 'debit' THEN amount ELSE 0 END) as total_spent
FROM credit_transactions
GROUP BY user_id;

-- Create unique index on user_id for the materialized view
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_credit_balances_user_id 
ON user_credit_balances (user_id);

-- Add comment
COMMENT ON MATERIALIZED VIEW user_credit_balances IS 'Cached user credit balances computed from transactions. Refresh periodically or after transactions for better performance.';