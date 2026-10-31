-- pgTAP coverage for call_turns, the per-response call latency telemetry table.
--
-- call_turns is RLS-enabled with deliberately ZERO policies: it is written and
-- read by the service role only. That is a property nothing else enforces - a
-- later migration adding a policy or a grant would silently open it, and the
-- per-user row count is itself a usage signal (how many turns each account
-- spoke). These tests exist to make that regression loud.
--
-- Run against the migrated local Supabase database with:
--
--   pnpm test:db

begin;

select plan(6);

select ok(
  (
    select relation.relrowsecurity
    from pg_catalog.pg_class relation
    where relation.oid = 'public.call_turns'::pg_catalog.regclass
  ),
  'call_turns has RLS enabled'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'call_turns'
  ),
  0,
  'call_turns has no RLS policies (service-role only by design)'
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
      'public.call_turns',
      privilege_name
    )
  ),
  0,
  'anon has no call_turns privileges'
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
      'authenticated',
      'public.call_turns',
      privilege_name
    )
  ),
  0,
  'authenticated has no call_turns privileges'
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
      'public.call_turns',
      privilege_name
    )
  ),
  7,
  'service_role retains all call_turns privileges'
);

-- The upsert in sexycall's CallTurnCollector targets this key so a retried
-- flush replaces a call's turns instead of duplicating them. Without the
-- constraint the upsert silently becomes an insert and turns accumulate.
-- Assert the column set by name. Checking only the arity would pass just as
-- happily against `unique (session_id, request_id)` - a test that survives the
-- bug it exists to catch.
--
-- The array order must match the constraint's declared order: col_is_unique
-- compares name[] arrays with plain equality, which is positional. Upsert
-- correctness itself does not depend on that order (Postgres matches an
-- `on conflict` target by column set), so a reorder in the migration is not a
-- bug - but it will fail here, and that is the intent: the declared order is
-- what makes "all turns for this call, in order" a range scan on the index.
select col_is_unique(
  'public',
  'call_turns',
  array['session_id', 'turn_index'],
  'call_turns has a unique constraint on (session_id, turn_index)'
);

select * from finish();

rollback;
