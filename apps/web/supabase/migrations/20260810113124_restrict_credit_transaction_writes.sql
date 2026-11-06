-- Credit transaction history is user-readable but server-written. Remove the
-- production-only client insert policy and normalize API-role privileges.
DROP POLICY IF EXISTS "User can insert client_transactions"
  ON public.credit_transactions;

DROP POLICY IF EXISTS "Users can view own credit transactions"
  ON public.credit_transactions;

CREATE POLICY "Users can view own credit transactions"
  ON public.credit_transactions
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

REVOKE ALL PRIVILEGES
  ON TABLE public.credit_transactions
  FROM anon, authenticated;

GRANT SELECT
  ON TABLE public.credit_transactions
  TO authenticated;

GRANT ALL PRIVILEGES
  ON TABLE public.credit_transactions
  TO service_role;
