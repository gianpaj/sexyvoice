# Database query performance implementation plan

## Status

Phase 3's Stripe customer uniqueness index is applied to production via
`20260913171301_add_unique_profiles_stripe_id.sql`. The remaining work is proposed
for review. The baseline investigation used read-only production inspection.

## Objective

Reduce application-controlled database time without adding overlapping indexes or
changing access rules. Prioritize the retention jobs and RLS warnings that have
measured production impact, then address growing dashboard and daily-stats reads.

## Current evidence

Production currently reports:

- 394 MB total database size;
- 99% index hit rate and 98% table hit rate;
- no blocking or long-running queries at inspection time;
- about 55,000 `audio_files`, 68,000 `usage_events`, 35,000
  `credit_transactions`, and 33,000 `profiles`;
- about 12 MB of `audio_files` table bloat; and
- 601 days since the reported statistics reset.

The long statistics window includes time before several current indexes existed.
Use a fresh observation window to judge current latency and index use.

The scheduled retention statements are the largest confirmed application-owned
outliers:

- soft deletion: 20 minutes 43 seconds across 119 calls;
- hard deletion: 13 minutes 47 seconds across 119 calls; and
- combined share: 18.3% of recorded database execution time.

The high-cost `pg_table_size`, unrestricted `COUNT(*)`, and `_base_query`
statements appear to come from Supabase Studio or inspection tools. They do not
match PostgREST statements or repository SQL and are not implementation targets.

## Decisions

1. Rewrite expensive query shapes before adding broad indexes.
2. Preserve retention windows, free-account rules, cron names, and schedules.
3. Preserve RLS behavior and add policy tests before changing policy definitions.
4. Add an index only when it supports a current query, constraint, RLS predicate,
   or foreign key.
5. Do not add `audio_files(model)`. Production already has the used
   `audio_files_model_created_at_idx (model, created_at)` index.
6. Keep index removals separate from index additions so they can be reviewed and
   rolled back independently.
7. Do not put one-off data cleanup in migrations. Resolve unexpected production
   data separately before applying a constraint.
8. Agents may create migration files but must not apply them. A human applies
   pending migrations before `pnpm test:db` runs.

## Phase 0: Capture a fresh baseline and reconcile schema drift

Run inspection commands sequentially. Concurrent commands can rotate the temporary
`cli_login_postgres` password underneath another command.

```bash
supabase --workdir apps/web inspect db db-stats --linked
supabase --workdir apps/web inspect db outliers --linked
supabase --workdir apps/web inspect db calls --linked
supabase --workdir apps/web inspect db table-stats --linked
supabase --workdir apps/web inspect db index-stats --linked
supabase --workdir apps/web inspect db vacuum-stats --linked
supabase --workdir apps/web inspect db bloat --linked
supabase --workdir apps/web inspect db long-running-queries --linked
supabase --workdir apps/web inspect db blocking --linked
supabase --workdir apps/web db advisors --linked --type performance --level info
```

Save the outputs outside the repository. Record the observation time and the
statistics reset time.

Use read-only catalog queries to compare production with migration history:

- indexes from `pg_indexes` for `audio_files`, `credit_transactions`, `credits`,
  `profiles`, `call_sessions`, and `usage_events`;
- policies from `pg_policies` for every table named by the performance advisor;
- cron commands from `cron.job` for both audio retention jobs; and
- installed extensions and versions needed by the migrations.

Production contains `audio_files_user_id_idx`, `audio_files_voice_id_idx`, and
`credits_user_id_index`, but repository migrations do not define those names.
Confirm their definitions before writing the reconciliation migration.

After preserving the baseline, a human may reset `pg_stat_statements` and collect
at least seven representative days. Do not reset production statistics as part of
a migration.

Deliverable:

- a current baseline that separates application traffic from Studio traffic and
  identifies production-only schema objects.

## Phase 1: Optimize the retention jobs

Create a migration with `supabase migration new optimize_audio_retention_queries`.
Do not invent its timestamp.

### Add one paid-user lookup index

Use one partial composite index for retention probes and paid transaction history:

```sql
create index if not exists credit_transactions_paid_user_created_at_idx
on public.credit_transactions (user_id, created_at desc)
where type in ('purchase', 'topup');
```

Its leading `user_id` column supports `NOT EXISTS` probes and distinct paid-user
lookups. `created_at` also supports newest-first paid transaction reads.

### Add one soft-retention scan index

```sql
create index if not exists audio_files_active_created_user_idx
on public.audio_files (created_at, user_id)
where status = 'active' and user_id is not null;
```

This index matches the soft-delete status predicate and date range. The hard-delete
job has no status predicate, so it cannot use this partial index; its date-range
index candidate is the existing `audio_files_created_at_idx`. Verify both choices
with target-row query plans. Do not add the reversed `(user_id, created_at)`
variant in this phase.

### Rewrite both cron statements

Update the jobs defined by:

- `apps/web/supabase/migrations/20260517000000_soft_delete_old_free_user_audio_files.sql`
- `apps/web/supabase/migrations/20260517001000_schedule_delete_old_free_user_audio_files.sql`

The new migration must unschedule and recreate the existing job names at their
current UTC schedules. Replace the `paid_users` CTE, `distinct`, `profiles` join,
and left anti-join with a direct predicate:

```sql
where af.user_id is not null
  and not exists (
    select 1
    from public.credit_transactions ct
    where ct.user_id = af.user_id
      and ct.type in ('purchase', 'topup')
  )
```

Keep these existing filters:

- soft delete: `status = 'active'` and older than 30 days;
- hard delete: older than 45 days.

Do not add batching in the first change. Measure the indexed rewrite first.
Introduce bounded batches only if execution time or lock duration remains high.

### Verify retention parity

Before applying the migration, compare old and new read-only target queries with:

- total target count;
- a deterministic sample of target IDs;
- paid users with old audio;
- free users with old audio;
- rows with `user_id is null`;
- rows with a non-null `user_id` but no matching `profiles` row, expected to be
  absent under the foreign key; and
- rows exactly around the 30-day and 45-day cutoffs.

Confirm that the `audio_files.user_id` foreign key to `profiles(id)` is enforced
and validated before removing the join. If orphaned rows exist, stop: the direct
predicate would include rows that the existing inner join excludes.

Run `EXPLAIN (ANALYZE, BUFFERS)` only on the target-row `SELECT`. Do not use
`EXPLAIN ANALYZE` on the production `UPDATE` or `DELETE`.

Deliverable:

- both retention jobs keep their product behavior and avoid rebuilding and joining
  a global paid-user set.

## Phase 2: Optimize RLS policy evaluation

Create a separate migration with
`supabase migration new optimize_rls_auth_initplans`.

The production advisor reports 15 policies that reevaluate an auth function per
row. Build the migration from current `pg_policies` output because production
policy names and repository migrations have drifted.

For each affected expression, replace:

```sql
auth.uid() = user_id
```

with:

```sql
(select auth.uid()) = user_id
```

Apply the same initialization-plan pattern to other stable auth functions reported
by the advisor. Preserve each policy's command, roles, `using` expression, and
`with check` expression.

Affected production tables include:

- `profiles`;
- `credits`;
- `voices`;
- `audio_files`;
- `call_sessions`;
- `usage_events`; and
- `api_keys`.

### Consolidate authenticated audio reads

The advisor reports two permissive `SELECT` policies for authenticated users on
`audio_files`. Replace the overlap with these effective rules:

- `anon`: may select rows where `is_public` is true;
- `authenticated`: may select public rows or rows whose `user_id` equals
  `(select auth.uid())`.

Keep policy names canonical and remove production-only duplicate policies only
after confirming their definitions.

Do not change the `readonly_claw` policy overlap in this phase. Its broader access
is operational and needs a separate authorization review.

### Add pgTAP coverage

Add a focused test under `apps/web/supabase/tests/` covering:

- anonymous users can read only public audio rows;
- authenticated users can read their own private rows and public rows;
- authenticated users cannot read another user's private rows;
- ownership checks for profile, credit, call-session, usage-event, and API-key
  writes remain unchanged; and
- service-role behavior remains unchanged.

Deliverable:

- the performance advisor no longer reports `auth_rls_initplan` for the targeted
  policies, with access behavior proven by pgTAP.

## Phase 3: Add constraints and reconcile supporting indexes

Create a migration with
`supabase migration new reconcile_query_supporting_indexes`.

### Capture production-only foreign-key indexes

After confirming the production definitions, add idempotent migration definitions
for:

```sql
create index if not exists audio_files_user_id_idx
on public.audio_files (user_id);

create index if not exists audio_files_voice_id_idx
on public.audio_files (voice_id);
```

These statements should be no-ops in production and create the indexes in new,
local, branch, and preview databases.

Add the advisor-reported foreign-key index if the production catalog confirms it
is absent:

```sql
create index if not exists call_sessions_voice_id_idx
on public.call_sessions (voice_id);
```

Do not add indexes for the two `cli_login_sessions` foreign keys. The table has
only a handful of rows and no measured workload that justifies them.

### Enforce Stripe customer identity

Applied to production in
`apps/web/supabase/migrations/20260913171301_add_unique_profiles_stripe_id.sql`.
The preflight and index definition below describe that step for unapplied databases.

Run this read-only preflight before creating the index:

```sql
select stripe_id, count(*)
from public.profiles
where stripe_id is not null
group by stripe_id
having count(*) > 1;
```

The query must return no rows. If it finds duplicates, stop and resolve them with a
separately reviewed production data fix.

Then add:

```sql
create unique index if not exists profiles_stripe_id_unique_idx
on public.profiles (stripe_id)
where stripe_id is not null;
```

This supports `.single()` Stripe customer lookups in
`apps/web/lib/supabase/queries.ts` and enforces the application's identity
assumption.

### Support profile date pagination

Add:

```sql
create index if not exists profiles_created_at_id_idx
on public.profiles (created_at, id)
where created_at is not null;
```

This matches the daily-stats keyset cursor and profile count range.

Deliverable:

- production and migration history agree on core foreign-key indexes, Stripe IDs
  are unique, and profile date scans have a matching index.

## Phase 4: Reduce application query volume

### Verify history-query hydration

`apps/web/components/react-query-client-provider.tsx` sets a global
`staleTime: 60 * 1000`. Both history queries inherit it, so hydrated audio rows
and their exact count remain fresh for 60 seconds from the server fetch.
Do not add shared query options solely to repeat this default.

If duplicate reads are observed, capture query keys, fetch timestamps, and
invalidation events before changing behavior. Preserve mutation-driven
invalidation and refetches after the freshness window expires.

Relevant files:

- `apps/web/lib/supabase/queries.client.ts`;
- `apps/web/app/[lang]/(dashboard)/dashboard/history/page.tsx`;
- `apps/web/app/[lang]/(dashboard)/dashboard/history/data-table.tsx`; and
- history mutation components and tests.

Keep the exact count in this phase. It drives delete-all behavior and remains
correct when PostgREST caps the row payload.

### Design server-side history pagination separately

The history table loads the active row set and paginates, filters, and sorts it in
the browser. Replacing this with keyset pagination changes filter and sort
semantics. Treat it as a separate UI and query design rather than a local database
optimization.

If approved, use `(created_at, id)` as the cursor and measure this partial index:

```sql
create index audio_files_active_user_created_at_idx
on public.audio_files (user_id, created_at desc, id desc)
where status = 'active';
```

Do not add it until the server-side query exists and its plan proves the current
`audio_files_user_id_idx` plus sort is inadequate.

### Reduce daily-stats row transfer

The daily-stats route already uses keyset pagination, a planned all-time audio
count, and one shared all-time credit transaction read. Preserve those choices.

Measure these remaining all-time transfers after the retention rollout:

- all credit transaction rows used for revenue windows; and
- all call-session durations used for lifetime duration totals.

If they enter the fresh outlier set, create a migration containing a narrowly
scoped aggregate function. It must:

- use `security invoker`;
- set `search_path = ''`;
- fully qualify relations;
- grant execution only to the role used by the scheduled route;
- accept explicit time bounds and internal-user IDs;
- return aggregates, not source rows; and
- preserve refund, manual-description, status, free-call, and internal-user rules.

Update `apps/web/app/api/daily-stats/route.ts` only after parity tests compare the
function result with the current TypeScript aggregation on fixed fixtures.

Deliverable:

- page hydration does not trigger duplicate reads, and growing all-time report
  reads have a measured path to database-side aggregation.

## Phase 5: Remove proven index overhead

Create a separate migration with
`supabase migration new remove_redundant_database_indexes` only after the fresh
observation window.

### Strong removal candidates

`usage_events_metadata_idx` is a 10 MB GIN index with zero recorded scans. Current
repository code writes and returns `metadata` but does not filter with JSONB
operators. Drop it if fresh production statistics and external-query review still
show no use.

`credits_user_id_index` is a production-only non-unique index that overlaps
`credits_user_id_unique`. Confirm the exact definition, then drop the non-unique
copy.

### Keep for now

Keep:

- `usage_events_request_id_idx`, because request IDs support operational tracing;
- unique indexes even when scan counts are zero, because they enforce constraints;
- small analysis indexes until their reporting consumers are confirmed; and
- `audio_files_created_at_idx` and `audio_files_model_created_at_idx`, which have
  substantial production use.

Deliverable:

- large or redundant indexes stop adding write cost without removing a live access
  path or constraint.

## Rollout order

1. Capture the baseline and reconcile production definitions.
2. Apply and observe the retention migration.
3. Apply and verify the RLS migration with pgTAP.
4. Apply the remaining supporting-index migration. Stripe uniqueness is applied
   to production.
5. Deploy application query-volume changes.
6. Collect at least seven representative days of fresh statistics.
7. Apply the index-removal migration only when the fresh data supports it.

Apply one migration group at a time. Check cron results, API errors, lock duration,
and query latency before moving to the next group.

## Rollback

- Retention: reschedule the prior cron commands and drop only the two new partial
  indexes if they cause regressions.
- RLS: restore the captured production policy definitions. Treat any access
  regression as a release blocker.
- Stripe uniqueness: keep the unique index unless it blocks valid product data;
  dropping it removes a payment identity invariant.
- Supporting indexes: drop a new index by its exact name if write latency or size
  outweighs measured read benefit.
- Application changes: restore the previous query options or route aggregation
  path without reverting schema changes that remain useful.
- Index removals: recreate each dropped index from the catalog definition captured
  in Phase 0.

## Verification

After a human applies pending migrations locally:

```bash
pnpm test:db
pnpm --filter @sexyvoice/web test -- tests/daily-stats-fetch-all-pages.test.ts
pnpm --filter @sexyvoice/web test -- tests/components/history-delete-all-button.test.tsx
pnpm test
pnpm fixall
pnpm type-check
```

After production rollout, rerun:

```bash
supabase --workdir apps/web inspect db outliers --linked
supabase --workdir apps/web inspect db index-stats --linked
supabase --workdir apps/web inspect db table-stats --linked
supabase --workdir apps/web inspect db vacuum-stats --linked
supabase --workdir apps/web inspect db blocking --linked
supabase --workdir apps/web db advisors --linked --type performance --level info
```

For each optimized statement, record:

- calls;
- mean, maximum, and total execution time;
- rows removed by filters;
- shared buffer hits and reads;
- chosen index; and
- cron completion and affected-row count.

## Acceptance criteria

- Both retention jobs preserve their 30-day and 45-day rules and complete without
  blocking application traffic.
- Their target-row plans use the paid-user partial index. Verify the soft-delete
  date scan against `audio_files_active_created_user_idx` and the hard-delete
  date scan against `audio_files_created_at_idx`; record any planner-selected
  alternative and its measured cost.
- Targeted RLS advisor warnings are cleared without changing allowed rows.
- No standalone `audio_files(model)` index exists.
- Stripe customer IDs are uniquely indexed when non-null.
- Production-only `audio_files` indexes are represented in migration history.
- History hydration preserves the existing 60-second freshness window and
  mutation-driven invalidation.
- Removed indexes show no fresh production use and have documented recreation SQL.
- `pnpm test:db`, `pnpm test`, `pnpm fixall`, and `pnpm type-check` pass.

## Expected files

Migration filenames must be generated by the Supabase CLI. Expected changes are:

- new migrations under `apps/web/supabase/migrations/` for retention, RLS,
  supporting indexes, and later index removal;
- a new pgTAP file under `apps/web/supabase/tests/` for RLS parity;
- history query or component updates only if measured duplicate reads establish
  a cause beyond the existing freshness default;
- focused daily-stats route and test updates only if fresh telemetry triggers the
  aggregate-function phase; and
- generated Supabase TypeScript types only if a database function changes the
  exposed API.
