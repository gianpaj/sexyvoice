-- Credit balances may only be mutated through the existing SECURITY DEFINER
-- RPCs. Remove stale owner-write policies and deny direct writes from API roles.
DROP POLICY IF EXISTS "Only system can insert credits"
  ON public.credits;

DROP POLICY IF EXISTS "Only system can update credits"
  ON public.credits;

-- Normalize the intended read and server access because Supabase role defaults
-- differ between existing hosted projects and freshly rebuilt local databases.
GRANT SELECT
  ON TABLE public.credits
  TO authenticated;

GRANT ALL PRIVILEGES
  ON TABLE public.credits
  TO service_role;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.credits
  FROM anon, authenticated;
