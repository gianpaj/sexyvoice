-- The production database already enforces one credit balance per user. Capture
-- that invariant in migration history because the upsert below depends on it.
CREATE UNIQUE INDEX IF NOT EXISTS credits_user_id_unique
  ON public.credits (user_id);

-- Credit grants are server-only operations. Keep the function SECURITY DEFINER
-- so service-role callers can update balances through RLS, but enforce the
-- caller role inside the function and restrict its RPC grant as defense in depth.
CREATE OR REPLACE FUNCTION public.increment_user_credits(
  user_id_var UUID,
  credit_amount_var INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF COALESCE((SELECT auth.role()), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized credit grant'
      USING ERRCODE = '42501';
  END IF;

  IF user_id_var IS NULL THEN
    RAISE EXCEPTION 'User ID is required'
      USING ERRCODE = '22023';
  END IF;

  IF credit_amount_var IS NULL OR credit_amount_var <= 0 THEN
    RAISE EXCEPTION 'Credit amount must be positive'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.credits (user_id, amount, created_at, updated_at)
  VALUES (user_id_var, credit_amount_var, NOW(), NOW())
  ON CONFLICT (user_id)
  DO UPDATE SET
    amount = public.credits.amount + EXCLUDED.amount,
    updated_at = NOW();
END;
$$;

-- Functions are executable by PUBLIC by default. Credit grants must only be
-- reachable through server-side clients using the service role.
REVOKE EXECUTE
  ON FUNCTION public.increment_user_credits(UUID, INTEGER)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
  ON FUNCTION public.increment_user_credits(UUID, INTEGER)
  TO service_role;
