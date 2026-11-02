-- =============================================================================
-- USAGE SUMMARY RPC FUNCTIONS
-- =============================================================================
-- Purpose: Aggregate usage data in SQL to avoid fetching all rows to the client
--
-- DESIGN PRINCIPLES:
-- 1. Performance: Aggregation happens in the database, returning only totals
-- 2. Security: SECURITY INVOKER ensures RLS policies are respected
-- 3. Flexibility: Supports both all-time and time-bounded queries
-- =============================================================================

-- -----------------------------------------------------------------------------
-- FUNCTION: get_usage_summary
-- -----------------------------------------------------------------------------
-- Returns aggregated usage summary for a user, optionally filtered by date range.
-- If no date range is provided, returns all-time summary.
--
-- Parameters:
--   p_user_id: The user's UUID (required)
--   p_start_date: Optional start date for filtering (inclusive)
--   p_end_date: Optional end date for filtering (exclusive)
--
-- Returns: Table with source_type, total credits, and operation count
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_usage_summary(
  p_user_id UUID,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  source_type public.usage_source_type,
  total_credits BIGINT,
  operation_count BIGINT
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ue.source_type,
    COALESCE(SUM(ue.credits_used)::BIGINT, 0) AS total_credits,
    COUNT(*)::BIGINT AS operation_count
  FROM public.usage_events ue
  WHERE ue.user_id = p_user_id
    AND (p_start_date IS NULL OR ue.occurred_at >= p_start_date)
    AND (p_end_date IS NULL OR ue.occurred_at < p_end_date)
  GROUP BY ue.source_type;
END;
$$;

-- -----------------------------------------------------------------------------
-- COMMENTS: Documentation for developers
-- -----------------------------------------------------------------------------
COMMENT ON FUNCTION public.get_usage_summary IS
  'Aggregates usage events by source_type for a user. Supports optional date range filtering. Returns totals for credits and operation counts, avoiding the need to fetch all rows to the client.';
