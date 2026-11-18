-- The SexyCall agent writes call sessions with the service role. Client writes
-- let users fabricate completed sessions, which trigger paid transcript
-- analysis, and lower duration_seconds, which the free call limit sums.
-- Users keep read access to their own sessions through the SELECT policy.
DROP POLICY IF EXISTS "Users can insert own call sessions"
  ON public.call_sessions;

DROP POLICY IF EXISTS "Users can update own call sessions"
  ON public.call_sessions;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON TABLE public.call_sessions
  FROM PUBLIC, anon, authenticated;

GRANT INSERT, UPDATE
  ON TABLE public.call_sessions
  TO service_role;
