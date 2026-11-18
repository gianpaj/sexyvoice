-- pgTAP coverage for server-written call sessions.
--
-- Run against the migrated local Supabase database with:
--
--   pnpm test:db

begin;

select plan(9);

select ok(
  (
    select relation.relrowsecurity
    from pg_catalog.pg_class relation
    where relation.oid =
      'public.call_sessions'::pg_catalog.regclass
  ),
  'call_sessions has RLS enabled'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'call_sessions'
      and policyname = 'Users can view own call sessions'
      and cmd = 'SELECT'
      and position('auth.uid()' in qual) > 0
      and position('user_id' in qual) > 0
  ),
  1,
  'authenticated users can select only their own sessions'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'call_sessions'
      and cmd <> 'SELECT'
  ),
  0,
  'call_sessions has no write policies'
);

select ok(
  not pg_catalog.has_table_privilege('anon', 'public.call_sessions', 'INSERT')
  and not pg_catalog.has_table_privilege('anon', 'public.call_sessions', 'UPDATE'),
  'anon cannot insert or update call sessions'
);

select ok(
  not pg_catalog.has_table_privilege(
    'authenticated', 'public.call_sessions', 'INSERT'
  ),
  'authenticated cannot insert call sessions'
);

select ok(
  not pg_catalog.has_table_privilege(
    'authenticated', 'public.call_sessions', 'UPDATE'
  ),
  'authenticated cannot update call sessions'
);

select ok(
  pg_catalog.has_table_privilege(
    'authenticated', 'public.call_sessions', 'SELECT'
  ),
  'authenticated retains call history read access'
);

select ok(
  pg_catalog.has_table_privilege('service_role', 'public.call_sessions', 'INSERT')
  and pg_catalog.has_table_privilege('service_role', 'public.call_sessions', 'UPDATE'),
  'service_role can insert and update call sessions'
);

select ok(
  (select rolbypassrls from pg_catalog.pg_roles where rolname = 'service_role'),
  'service_role writes do not require client write policies'
);

select * from finish();

rollback;
