-- pgTAP coverage for the server-only credit purchase grant.
--
-- Run against the migrated local Supabase database with:
--
--   pnpm test:db

begin;

select plan(15);

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
      'public.grant_purchased_credits(uuid, public.credit_transaction_type, integer, text, text, jsonb, text)'::pg_catalog.regprocedure
  ),
  false,
  'PUBLIC cannot execute grant_purchased_credits'
);

select is(
  pg_catalog.has_function_privilege(
    'anon',
    'public.grant_purchased_credits(uuid, public.credit_transaction_type, integer, text, text, jsonb, text)',
    'EXECUTE'
  ),
  false,
  'anon cannot execute grant_purchased_credits'
);

select is(
  pg_catalog.has_function_privilege(
    'authenticated',
    'public.grant_purchased_credits(uuid, public.credit_transaction_type, integer, text, text, jsonb, text)',
    'EXECUTE'
  ),
  false,
  'authenticated cannot execute grant_purchased_credits'
);

select is(
  pg_catalog.has_function_privilege(
    'service_role',
    'public.grant_purchased_credits(uuid, public.credit_transaction_type, integer, text, text, jsonb, text)',
    'EXECUTE'
  ),
  true,
  'service_role can execute grant_purchased_credits'
);

select ok(
  not (
    select function.prosecdef
    from pg_catalog.pg_proc function
    where function.oid =
      'public.grant_purchased_credits(uuid, public.credit_transaction_type, integer, text, text, jsonb, text)'::pg_catalog.regprocedure
  ),
  'grant_purchased_credits runs as SECURITY INVOKER'
);

select ok(
  (
    select coalesce(
      'search_path=""' = any(function.proconfig),
      false
    )
    from pg_catalog.pg_proc function
    where function.oid =
      'public.grant_purchased_credits(uuid, public.credit_transaction_type, integer, text, text, jsonb, text)'::pg_catalog.regprocedure
  ),
  'grant_purchased_credits has an empty search_path'
);

-- Defer the Auth-user reference so this unit fixture does not invoke signup
-- triggers. The test rolls back, so the deferred reference is never committed.
alter table public.profiles
  alter constraint profiles_id_fkey
  deferrable initially deferred;

insert into public.profiles (id, username)
values (
  '66666666-6666-4666-8666-666666666666',
  'pgtap-credit-purchase@example.com'
);

insert into public.credits (user_id, amount)
values ('66666666-6666-4666-8666-666666666666', 100);

set local request.jwt.claims = '{"role":"service_role"}';
set local role service_role;

select is(
  public.grant_purchased_credits(
    '66666666-6666-4666-8666-666666666666'::uuid,
    'purchase',
    25,
    'pi_pgtap_purchase',
    'Subscription payment - $5',
    '{"dollarAmount": 5, "isFirstSubscription": true}'::jsonb,
    'sub_pgtap'
  ),
  true,
  'a new payment is recorded and granted'
);

select is(
  public.grant_purchased_credits(
    '66666666-6666-4666-8666-666666666666'::uuid,
    'purchase',
    25,
    'pi_pgtap_purchase',
    'Subscription payment - $5',
    '{"dollarAmount": 5, "isFirstSubscription": true}'::jsonb,
    'sub_pgtap'
  ),
  false,
  'a payment that is already recorded grants nothing'
);

reset role;

select results_eq(
  $$
    select type::text, amount, subscription_id, description, metadata
    from public.credit_transactions
    where reference_id = 'pi_pgtap_purchase'
  $$,
  $$
    values (
      'purchase',
      25,
      'sub_pgtap',
      'Subscription payment - $5',
      '{"dollarAmount": 5, "isFirstSubscription": true}'::jsonb
    )
  $$,
  'the payment has exactly one ledger row'
);

select is(
  (
    select amount
    from public.credits
    where user_id = '66666666-6666-4666-8666-666666666666'
  ),
  125,
  'the balance includes the payment once'
);

set local role service_role;

select throws_ok(
  $$select public.grant_purchased_credits(
    '66666666-6666-4666-8666-666666666666'::uuid,
    'freemium',
    25,
    'pi_pgtap_freemium',
    'Free credits',
    '{}'::jsonb
  )$$,
  '22023',
  'Only purchase and topup credits can be granted',
  'grants without a unique payment reference index are rejected'
);

-- increment_user_credits rejects a zero amount after the ledger insert.
select throws_ok(
  $$select public.grant_purchased_credits(
    '66666666-6666-4666-8666-666666666666'::uuid,
    'topup',
    0,
    'pi_pgtap_retry',
    'Credit top-up - $5',
    '{"dollarAmount": 5}'::jsonb
  )$$,
  '22023',
  'Credit amount must be positive',
  'a failed balance update fails the grant'
);

reset role;

select is_empty(
  $$
    select id
    from public.credit_transactions
    where reference_id = 'pi_pgtap_retry'
  $$,
  'a failed balance update leaves no ledger row'
);

set local role service_role;

select is(
  public.grant_purchased_credits(
    '66666666-6666-4666-8666-666666666666'::uuid,
    'topup',
    50,
    'pi_pgtap_retry',
    'Credit top-up - $5',
    '{"dollarAmount": 5}'::jsonb
  ),
  true,
  'a retry after a failed balance update grants the credits'
);

reset role;

select is(
  (
    select amount
    from public.credits
    where user_id = '66666666-6666-4666-8666-666666666666'
  ),
  175,
  'the retried grant reaches the balance'
);

select * from finish();

rollback;
