-- Provider costs and credit consumption are recorded by privileged servers.
-- Users retain access to their own usage history through the SELECT policy.
DROP POLICY IF EXISTS "Service role can insert usage events"
  ON public.usage_events;

REVOKE INSERT
  ON TABLE public.usage_events
  FROM PUBLIC, anon, authenticated;

GRANT INSERT
  ON TABLE public.usage_events
  TO service_role;
