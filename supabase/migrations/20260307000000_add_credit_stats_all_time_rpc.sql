-- RPC to compute all-time credit transaction aggregates in the database.
-- This avoids fetching every row into the application layer (which caused
-- statement timeouts as the table grew).
CREATE OR REPLACE FUNCTION public.get_credit_transactions_all_time_stats()
RETURNS TABLE(
  total_purchase_count bigint,
  total_refund_count   bigint,
  total_revenue_usd    numeric,
  total_refund_usd     numeric,
  total_unique_paid_users bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    COUNT(*)         FILTER (WHERE type IN ('purchase', 'topup'))  AS total_purchase_count,
    COUNT(*)         FILTER (WHERE type = 'refund')                AS total_refund_count,
    COALESCE(SUM((metadata->>'dollarAmount')::numeric), 0)         AS total_revenue_usd,
    COALESCE(SUM((metadata->>'dollarAmount')::numeric)
             FILTER (WHERE type = 'refund'), 0)                    AS total_refund_usd,
    COUNT(DISTINCT user_id)
             FILTER (WHERE type IN ('purchase', 'topup'))          AS total_unique_paid_users
  FROM public.credit_transactions
  WHERE type IN ('purchase', 'topup', 'refund')
    AND NOT description ILIKE '%manual%';
$$;
