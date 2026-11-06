-- pgTAP coverage for the server-only credit grant RPC.
--
-- Run against the local Supabase database with:
--
--   pnpm test:db

begin;

select plan(18);

select is(
  (
    select coalesce(
      bool_or(acl.grantee = 0 and acl.privilege_type = 'EXECUTE'),
      false
    )
    from pg_catalog.pg_proc function
    cross join lateral pg_catalog.aclexplode(
      coalesce(
        function.proacl,
        pg_catalog.acldefault('f', function.proowner)
      )
    ) acl
    where function.oid =
      'public.increment_user_credits(uuid, integer)'::pg_catalog.regprocedure
  ),
  false,
  'PUBLIC cannot execute increment_user_credits'
);

select is(
  pg_catalog.has_function_privilege(
    'anon',
    'public.increment_user_credits(uuid, integer)',
    'EXECUTE'
  ),
  false,
  'anon cannot execute increment_user_credits'
);

select is(
  pg_catalog.has_function_privilege(
    'authenticated',
    'public.increment_user_credits(uuid, integer)',
    'EXECUTE'
  ),
  false,
  'authenticated cannot execute increment_user_credits'
);

select is(
  pg_catalog.has_function_privilege(
    'service_role',
    'public.increment_user_credits(uuid, integer)',
    'EXECUTE'
  ),
  true,
  'service_role can execute increment_user_credits'
);

select ok(
  (
    select function.prosecdef
    from pg_catalog.pg_proc function
    where function.oid =
      'public.increment_user_credits(uuid, integer)'::pg_catalog.regprocedure
  ),
  'increment_user_credits remains SECURITY DEFINER'
);

select ok(
  (
    select coalesce(
      'search_path=""' = any(function.proconfig),
      false
    )
    from pg_catalog.pg_proc function
    where function.oid =
      'public.increment_user_credits(uuid, integer)'::pg_catalog.regprocedure
  ),
  'increment_user_credits has an empty search_path'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'credits'
      and policyname in (
        'Only system can insert credits',
        'Only system can update credits'
      )
  ),
  0,
  'legacy credit write policies are absent'
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
      'public.credits',
      privilege_name
    )
  ),
  0,
  'anon has no credit table privileges'
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
      'public.credits',
      privilege_name
    )
  ),
  0,
  'authenticated has no direct credit mutation privileges'
);

select ok(
  pg_catalog.has_table_privilege(
    'authenticated',
    'public.credits',
    'SELECT'
  ),
  'authenticated retains credit read access'
);

select ok(
  pg_catalog.has_table_privilege(
    'service_role',
    'public.credits',
    'INSERT'
  )
    and pg_catalog.has_table_privilege(
      'service_role',
      'public.credits',
      'UPDATE'
    ),
  'service_role retains credit mutation access'
);

set local request.jwt.claims = '{"role":"anon"}';

select throws_ok(
  $$select public.increment_user_credits(
    '22222222-2222-4222-8222-222222222222'::uuid,
    1
  )$$,
  '42501',
  'Unauthorized credit grant',
  'the function body rejects callers without the service role'
);

-- Defer the auth.users reference so this unit fixture does not invoke signup
-- triggers. The test rolls back, so the deferred reference is never committed.
alter table public.profiles
  alter constraint profiles_id_fkey
  deferrable initially deferred;

insert into public.profiles (id, username)
values (
  '22222222-2222-4222-8222-222222222222',
  'pgtap-credit-grant@example.com'
);

insert into public.credits (user_id, amount)
values ('22222222-2222-4222-8222-222222222222', 100);

set local request.jwt.claims = '{"role":"service_role"}';
set local role service_role;

select throws_ok(
  $$select public.increment_user_credits(
    '22222222-2222-4222-8222-222222222222'::uuid,
    0
  )$$,
  '22023',
  'Credit amount must be positive',
  'zero-credit grants are rejected'
);

select throws_ok(
  $$select public.increment_user_credits(
    '22222222-2222-4222-8222-222222222222'::uuid,
    -1
  )$$,
  '22023',
  'Credit amount must be positive',
  'negative credit grants are rejected'
);

select throws_ok(
  $$select public.increment_user_credits(
    '22222222-2222-4222-8222-222222222222'::uuid,
    null
  )$$,
  '22023',
  'Credit amount must be positive',
  'NULL credit grants are rejected'
);

select throws_ok(
  $$select public.increment_user_credits(null, 1)$$,
  '22023',
  'User ID is required',
  'a NULL user ID is rejected'
);

select lives_ok(
  $$select public.increment_user_credits(
    '22222222-2222-4222-8222-222222222222'::uuid,
    25
  )$$,
  'service-role credit grants succeed'
);

reset role;

select is(
  (
    select amount
    from public.credits
    where user_id = '22222222-2222-4222-8222-222222222222'
  ),
  125,
  'a valid service-role grant increments the balance'
);

select * from finish();

rollback;
