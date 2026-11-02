-- pgTAP coverage for the server-written credit transaction ledger.
--
-- Run against the migrated local Supabase database with:
--
--   pnpm test:db

begin;

select plan(7);

select ok(
  (
    select relation.relrowsecurity
    from pg_catalog.pg_class relation
    where relation.oid =
      'public.credit_transactions'::pg_catalog.regclass
  ),
  'credit_transactions has RLS enabled'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'credit_transactions'
      and policyname = 'Users can view own credit transactions'
      and cmd = 'SELECT'
      and roles::text[] = array['authenticated']::text[]
      and position('auth.uid()' in qual) > 0
      and position('user_id' in qual) > 0
  ),
  1,
  'authenticated users can select only their own transactions'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'credit_transactions'
      and cmd <> 'SELECT'
  ),
  0,
  'credit_transactions has no write policies'
);

select is(
  (
    select count(*)::integer
    from (
      values
        ('SELECT'),
        ('INSERT'),
        ('UPDATE'),
        ('DELETE'),
        ('TRUNCATE'),
        ('REFERENCES'),
        ('TRIGGER')
    ) as privileges(privilege_name)
    where pg_catalog.has_table_privilege(
      'anon',
      'public.credit_transactions',
      privilege_name
    )
  ),
  0,
  'anon has no credit transaction privileges'
);

select ok(
  pg_catalog.has_table_privilege(
    'authenticated',
    'public.credit_transactions',
    'SELECT'
  ),
  'authenticated retains credit transaction read access'
);

select is(
  (
    select count(*)::integer
    from (
      values
        ('INSERT'),
        ('UPDATE'),
        ('DELETE'),
        ('TRUNCATE'),
        ('REFERENCES'),
        ('TRIGGER')
    ) as privileges(privilege_name)
    where pg_catalog.has_table_privilege(
      'authenticated',
      'public.credit_transactions',
      privilege_name
    )
  ),
  0,
  'authenticated has no credit transaction write privileges'
);

select is(
  (
    select count(*)::integer
    from (
      values
        ('SELECT'),
        ('INSERT'),
        ('UPDATE'),
        ('DELETE'),
        ('TRUNCATE'),
        ('REFERENCES'),
        ('TRIGGER')
    ) as privileges(privilege_name)
    where pg_catalog.has_table_privilege(
      'service_role',
      'public.credit_transactions',
      privilege_name
    )
  ),
  7,
  'service_role retains all credit transaction privileges'
);

select * from finish();

rollback;
