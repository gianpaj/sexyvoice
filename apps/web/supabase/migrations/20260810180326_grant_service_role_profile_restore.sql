-- SECURITY INVOKER uses the caller's table privileges. Normalize the access
-- required by the server-side preflight and profile restoration because
-- Supabase role defaults differ between hosted and freshly rebuilt databases.
GRANT SELECT, INSERT
ON TABLE public.profiles
TO service_role;
