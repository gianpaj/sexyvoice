/*
  # Create function to refresh materialized views

  1. Creates a utility function to refresh materialized views
  2. Can be used to refresh user_credit_balances view for performance
*/

-- Create function to refresh materialized views
CREATE OR REPLACE FUNCTION refresh_materialized_view(view_name TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  EXECUTE format('REFRESH MATERIALIZED VIEW CONCURRENTLY %I', view_name);
END;
$$;

-- Add comment
COMMENT ON FUNCTION refresh_materialized_view(TEXT) IS 'Utility function to refresh materialized views concurrently';