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
select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.call_turns'::pg_catalog.regclass
      and contype = 'u'
      and array_length(conkey, 1) = 2
  ),
  'call_turns has a two-column unique constraint (session_id, turn_index)'
);

select * from finish();

rollback;
