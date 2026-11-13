-- pgTAP coverage for owner-only profile reads.
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
    where relation.oid = 'public.profiles'::pg_catalog.regclass
  ),
  'profiles has RLS enabled'
);

select results_eq(
  $$
    select policyname::text, roles::text[]
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and cmd = 'SELECT'
  $$,
  $$ values ('Users can view own profile', array['authenticated']::text[]) $$,
  'only authenticated users have a profile read policy'
);

select ok(
  (
    select position('auth.uid()' in qual) > 0
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'Users can view own profile'
  ),
  'the profile read policy compares the row with the caller'
);

-- Defer the Auth-user reference so the fixture does not need auth.users rows.
-- The test rolls back before PostgreSQL checks the deferred constraint.
alter table public.profiles
  alter constraint profiles_id_fkey
  deferrable initially deferred;

insert into public.profiles (id, username)
values
  (
    '44444444-4444-4444-8444-444444444444',
    'pgtap-profile-owner@example.com'
  ),
  (
    '55555555-5555-4555-8555-555555555555',
    'pgtap-profile-other@example.com'
  );

set local request.jwt.claims = '{"role":"anon"}';
set local role anon;

select is_empty(
  $$ select id from public.profiles $$,
  'anonymous requests cannot list profiles'
);

reset role;

set local request.jwt.claims =
  '{"role":"authenticated","sub":"44444444-4444-4444-8444-444444444444"}';
set local role authenticated;

select results_eq(
  $$ select id from public.profiles $$,
  $$ values ('44444444-4444-4444-8444-444444444444'::uuid) $$,
  'a signed-in user reads only their own profile'
);

select is_empty(
  $$
    select id
    from public.profiles
    where id = '55555555-5555-4555-8555-555555555555'
  $$,
  'a signed-in user cannot read another profile'
);

reset role;

set local request.jwt.claims = '{"role":"service_role"}';
set local role service_role;

select is(
  (
    select count(*)::integer
    from public.profiles
    where id in (
      '44444444-4444-4444-8444-444444444444',
      '55555555-5555-4555-8555-555555555555'
    )
  ),
  2,
  'service_role reads every profile'
);

reset role;

select * from finish();

rollback;
