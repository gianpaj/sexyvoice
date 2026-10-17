# Local Postgres 17 upgrade

## Decision and scope

Use local project ID `sexyvoice.ai-pg17` to isolate the upgraded Docker volumes.
The user authorized local writes and migrations for this operation only.
No hosted database commands were run. Reusing the original PG15 volume was
rejected because PG17 cannot read its physical data directory.

## Recovery assets

- Original volumes remain unchanged: `supabase_db_sexyvoice.ai`,
  `supabase_storage_sexyvoice.ai`, and `supabase_edge_runtime_sexyvoice.ai`.
- Git-ignored backups: `scripts/backups/supabase-local-2026-09-30/`.
  These include verified volume archives, checksums, a full PG15 logical dump,
  adapted restore SQL, logs, and verification results. Dumps contain secrets.
- The stopped `sexyvoice-pg15-upgrade-source` container uses a disposable copy,
  `supabase_db_sexyvoice_pg15_upgrade_copy`, with networking disabled.
- Recovery requires a separate PG15 project or volume copy; never point PG17
  at the retained PG15 data directory. Do not prune these recovery assets.

## Restore decisions

- Removed unused `pgjwt` from the disposable source for PG17 compatibility.
- Adapted role-membership grantors to bootstrap superuser `supabase_admin`,
  updated the `pg_stat_statements_reset` grant signature, and omitted the legacy
  GraphQL function grant as the CLI restore wrapper does.
- Restored `postgres` database ownership and dashboard privileges explicitly.
- Recreated internal `_supabase` service metadata; its original contents remain
  in the full backup. Copied Storage and Edge Runtime volumes separately.
- Left two local cleanup cron jobs inactive; no HTTP requests were queued.
- Applied local migrations `20260913171301` and `20260921180000`.

## Verification

Postgres image `17.11.0.002`, PostgREST `v14.18`, Auth `v2.197.0`, and Storage
`v1.77.5` are running. All 70 source table counts matched before service upgrades;
application/Auth/Storage content was preserved. Migration-history hash differences
were ordering differences; keyed row comparisons matched. Original volume archive
contents matched byte-for-byte. Auth/Storage health and a REST credits query passed.
`pnpm test:db` passed 55 tests; `pnpm fixall` and `pnpm type-check` passed.
The source already denied `voices` SELECT to anon and service_role; this remains unchanged.
