-- pgTAP coverage for server-written saved voices.
--
-- Run against the migrated local Supabase database with:
--
--   pnpm test:db

begin;

select plan(7);

select has_column(
  'public',
  'audio_references',
  'locale',
  'audio_references has a locale column'
);

select col_type_is(
  'public',
  'audio_references',
  'locale',
  'text',
  'audio_references.locale is text'
);

select ok(
  (
    select relation.relrowsecurity
    from pg_catalog.pg_class relation
    where relation.oid = 'public.audio_references'::pg_catalog.regclass
  ),
  'audio_references has RLS enabled'
);

select results_eq(
  $$
    select cmd::text
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'audio_references'
    order by cmd
  $$,
  $$ values ('DELETE'), ('SELECT') $$,
  'audio_references has only owner SELECT and DELETE policies'
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
      'public.audio_references',
      privilege_name
    )
  ),
  0,
  'anon has no audio reference privileges'
);

select results_eq(
  $$
    select privilege_name
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
      'public.audio_references',
      privilege_name
    )
    order by privilege_name
  $$,
  $$ values ('DELETE'), ('SELECT') $$,
  'authenticated can only read and delete audio references'
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
      'public.audio_references',
      privilege_name
    )
  ),
  7,
  'service_role retains all audio reference privileges'
);

select * from finish();

rollback;
