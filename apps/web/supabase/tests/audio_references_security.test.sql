-- pgTAP coverage for saved voices.
--
-- Run against the migrated local Supabase database with:
--
--   pnpm test:db

begin;

select plan(2);

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

select * from finish();

rollback;
