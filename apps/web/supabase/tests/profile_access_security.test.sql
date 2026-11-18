-- Run with pnpm test:db after applying migrations locally.
begin;
select plan(18);

select ok(
  (select relrowsecurity from pg_catalog.pg_class
   where oid = 'public.profiles'::regclass),
  'profiles has RLS enabled'
);

select is(
  (select count(*)::integer
   from unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE',
                     'REFERENCES', 'TRIGGER']) as p(privilege)
   where has_table_privilege('anon', 'public.profiles', privilege)),
  0,
  'anon has no profile table privileges'
);

select results_eq(
  $$ select privilege from unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE',
       'TRUNCATE', 'REFERENCES', 'TRIGGER']) as p(privilege)
     where has_table_privilege('authenticated', 'public.profiles', privilege)
     order by privilege $$,
  $$ values ('SELECT') $$,
  'authenticated retains only table-wide SELECT'
);

select ok(
  has_column_privilege('authenticated', 'public.profiles', 'avatar_url', 'UPDATE'),
  'authenticated can update avatars'
);

select is(
  (select count(*)::integer from information_schema.columns
   where table_schema = 'public' and table_name = 'profiles'
     and column_name <> 'avatar_url'
     and has_column_privilege('authenticated', 'public.profiles', column_name, 'UPDATE')),
  0,
  'authenticated cannot update any other profile column'
);

select ok(
  has_table_privilege('service_role', 'public.profiles', 'SELECT')
  and has_table_privilege('service_role', 'public.profiles', 'INSERT'),
  'service_role can read and restore profiles'
);

-- Avoid signup triggers; all fixtures roll back before the FK is checked.
alter table public.profiles alter constraint profiles_id_fkey
  deferrable initially deferred;
insert into public.profiles (id, username) values
  ('44444444-4444-4444-8444-444444444444', 'pgtap-profile-owner@example.com'),
  ('55555555-5555-4555-8555-555555555555', 'pgtap-profile-other@example.com');

set local request.jwt.claims = '{"role":"anon"}';
set local role anon;
select throws_ok(
  $$ select id, username from public.profiles $$,
  '42501', 'permission denied for table profiles',
  'anonymous email enumeration is denied'
);
reset role;

-- RLS must remain safe even if a legacy grant is accidentally restored.
grant select on public.profiles to anon;
set local role anon;
select is_empty(
  $$ select id, username from public.profiles $$,
  'RLS also blocks anonymous enumeration independently of grants'
);
reset role;

set local request.jwt.claims =
  '{"role":"authenticated","sub":"44444444-4444-4444-8444-444444444444"}';
set local role authenticated;
select results_eq(
  $$ select username from public.profiles $$,
  $$ values ('pgtap-profile-owner@example.com'::text) $$,
  'signed-in users see only their own email'
);
select is_empty(
  $$ select username from public.profiles
     where id = '55555555-5555-4555-8555-555555555555' $$,
  'direct lookup cannot reveal another email'
);
select throws_ok(
  $$ update public.profiles set username = 'victim@example.com'
     where id = '44444444-4444-4444-8444-444444444444' $$,
  '42501', 'permission denied for table profiles',
  'owners cannot rewrite their email-backed username'
);
select throws_ok(
  $$ update public.profiles set stripe_id = 'cus_other'
     where id = '44444444-4444-4444-8444-444444444444' $$,
  '42501', 'permission denied for table profiles',
  'owners cannot rewrite their Stripe customer link'
);
select throws_ok(
  $$ insert into public.profiles (id, username)
     values ('66666666-6666-4666-8666-666666666666', 'victim@example.com') $$,
  '42501', 'permission denied for table profiles',
  'clients cannot insert arbitrary profile identities'
);
select results_eq(
  $$ update public.profiles set avatar_url = 'https://example.com/avatar.png'
     where id = '44444444-4444-4444-8444-444444444444' returning username $$,
  $$ values ('pgtap-profile-owner@example.com'::text) $$,
  'owners can still update their profile'
);
select is_empty(
  $$ update public.profiles set avatar_url = 'https://example.com/other.png'
     where id = '55555555-5555-4555-8555-555555555555' returning id $$,
  'users cannot update another profile'
);
reset role;

set local request.jwt.claims = '{"role":"authenticated"}';
set local role authenticated;
select is_empty(
  $$ select username from public.profiles $$,
  'a missing user ID cannot enumerate profiles'
);
reset role;

set local role service_role;
select is(
  (select count(*)::integer from public.profiles where id in (
    '44444444-4444-4444-8444-444444444444',
    '55555555-5555-4555-8555-555555555555'
  )),
  2,
  'privileged server lookups can still read both profiles'
);
select results_eq(
  $$ update public.profiles set stripe_id = 'cus_server'
     where id = '44444444-4444-4444-8444-444444444444' returning stripe_id $$,
  $$ values ('cus_server'::text) $$,
  'service_role can still persist Stripe customer links'
);
reset role;

select * from finish();
rollback;
