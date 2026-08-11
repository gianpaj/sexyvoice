-- pgTAP coverage for public.restore_inactive_user.
--
-- Run against a local database with all migrations applied:
--
--   supabase test db supabase/tests/restore_inactive_user.test.sql

begin;

select plan(17);

select ok(
  has_function_privilege(
    'service_role',
    'public.restore_inactive_user(uuid,text,timestamp with time zone)',
    'EXECUTE'
  ),
  'service_role can execute restore_inactive_user'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.restore_inactive_user(uuid,text,timestamp with time zone)',
    'EXECUTE'
  ),
  'authenticated users cannot execute restore_inactive_user'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.restore_inactive_user(uuid,text,timestamp with time zone)',
    'EXECUTE'
  ),
  'anonymous users cannot execute restore_inactive_user'
);

select ok(
  has_table_privilege('service_role', 'public.profiles', 'SELECT')
    and has_table_privilege('service_role', 'public.profiles', 'INSERT'),
  'service_role can read and restore profiles'
);

-- Defer the Auth-user reference so the fixture can start with no application
-- rows without altering auth.users or invoking signup triggers. This test is
-- rolled back before PostgreSQL checks the deferred constraint.
alter table public.profiles
  alter constraint profiles_id_fkey
  deferrable initially deferred;

set local role service_role;

select is(
  public.restore_inactive_user(
    '22222222-2222-4222-8222-222222222222',
    'pgtap-returning-user@example.com',
    '2025-08-29 11:38:46.727344+00'
  ),
  true,
  'the first call restores the retained Auth user'
);

reset role;

select is(
  (
    select count(*)
    from public.profiles
    where id = '22222222-2222-4222-8222-222222222222'
  ),
  1::bigint,
  'one profile is restored'
);

select is(
  (
    select username
    from public.profiles
    where id = '22222222-2222-4222-8222-222222222222'
  ),
  'pgtap-returning-user@example.com',
  'the restored profile uses the Auth email'
);

select is(
  (
    select created_at
    from public.profiles
    where id = '22222222-2222-4222-8222-222222222222'
  ),
  '2025-08-29 11:38:46.727344+00'::timestamp with time zone,
  'the restored profile keeps the original Auth creation date'
);

select ok(
  (
    select updated_at > created_at
    from public.profiles
    where id = '22222222-2222-4222-8222-222222222222'
  ),
  'the restored profile records the later restoration time'
);

select is(
  (
    select count(*)
    from public.credits
    where user_id = '22222222-2222-4222-8222-222222222222'
  ),
  1::bigint,
  'one credit balance is restored'
);

select is(
  (
    select amount
    from public.credits
    where user_id = '22222222-2222-4222-8222-222222222222'
  ),
  10000,
  'the restored balance contains the free 10,000 credits'
);

select is(
  (
    select created_at
    from public.credits
    where user_id = '22222222-2222-4222-8222-222222222222'
  ),
  '2025-08-29 11:38:46.727344+00'::timestamp with time zone,
  'the restored balance keeps the original Auth creation date'
);

select is(
  (
    select count(*)
    from public.credit_transactions
    where user_id = '22222222-2222-4222-8222-222222222222'
  ),
  1::bigint,
  'one credit transaction is restored'
);

select ok(
  (
    select amount = 10000
      and type = 'freemium'
      and description = 'Restored initial user credits'
    from public.credit_transactions
    where user_id = '22222222-2222-4222-8222-222222222222'
  ),
  'the restored transaction identifies the restored free grant'
);

select is(
  (
    select created_at
    from public.credit_transactions
    where user_id = '22222222-2222-4222-8222-222222222222'
  ),
  '2025-08-29 11:38:46.727344+00'::timestamp with time zone,
  'the restored transaction keeps the original Auth creation date'
);

set local role service_role;

select is(
  public.restore_inactive_user(
    '22222222-2222-4222-8222-222222222222',
    'pgtap-returning-user@example.com',
    '2025-08-29 11:38:46.727344+00'
  ),
  false,
  'a repeated call reports that the profile already exists'
);

reset role;

select ok(
  (
    select count(*) = 1
    from public.profiles
    where id = '22222222-2222-4222-8222-222222222222'
  )
  and (
    select count(*) = 1
    from public.credits
    where user_id = '22222222-2222-4222-8222-222222222222'
  )
  and (
    select count(*) = 1
    from public.credit_transactions
    where user_id = '22222222-2222-4222-8222-222222222222'
  ),
  'a repeated call does not duplicate restored application state'
);

select * from finish();

rollback;
