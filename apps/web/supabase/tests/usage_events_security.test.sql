-- pgTAP coverage for the server-written usage ledger.
--
-- Run against the migrated local Supabase database with:
--
--   pnpm test:db

begin;

select plan(8);

select ok(
  (
    select relation.relrowsecurity
    from pg_catalog.pg_class relation
    where relation.oid =
      'public.usage_events'::pg_catalog.regclass
  ),
  'usage_events has RLS enabled'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'usage_events'
      and policyname = 'Users can view own usage events'
      and cmd = 'SELECT'
      and position('auth.uid()' in qual) > 0
      and position('user_id' in qual) > 0
  ),
  1,
  'authenticated users can select only their own events'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'usage_events'
      and cmd <> 'SELECT'
  ),
  0,
  'usage_events has no write policies'
);

select ok(
  not pg_catalog.has_table_privilege('anon', 'public.usage_events', 'INSERT'),
  'anon cannot insert usage events'
);

select ok(
  not pg_catalog.has_table_privilege(
    'authenticated', 'public.usage_events', 'INSERT'
  ),
  'authenticated cannot insert usage events'
);

select ok(
  pg_catalog.has_table_privilege(
    'authenticated', 'public.usage_events', 'SELECT'
  ),
  'authenticated retains usage history read access'
);

select ok(
  pg_catalog.has_table_privilege('service_role', 'public.usage_events', 'INSERT'),
  'service_role can insert usage events'
);

select ok(
  (select rolbypassrls from pg_catalog.pg_roles where rolname = 'service_role'),
  'service_role writes do not require a client INSERT policy'
);

select * from finish();

rollback;
