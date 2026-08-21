-- =============================================================================
-- Migration: promote character_id / scene_id / scene_modified out of
--            call_sessions.metadata into typed columns
-- =============================================================================
-- Purpose
--   The agent already records which character and scene a call used, but only
--   inside the untyped `metadata` jsonb blob (sexycall: `create_call_session`
--   in src/agent.py writes metadata.character_id / scene_id / scene_modified).
--
--   Every analytics query therefore has to join on
--   `(metadata->>'character_id')::uuid` with no foreign key, no index, and no
--   type safety. Any call whose character row has since disappeared joins to
--   nothing and renders as "Unknown".
--
--   Characters cascade-delete with their owner (`characters.user_id references
--   auth.users(id) on delete cascade`), so the population of dangling ids grows
--   every time an account is removed. That is the most likely source of the
--   growing "Unknown" character counts on the calls dashboard.
--
-- Affected objects
--   public.call_sessions - adds character_id, scene_id, scene_modified
--
-- Design notes
--   * character_id is a real foreign key with `on delete set null`, so a
--     deleted character now reads as NULL ("this character no longer exists")
--     rather than as a uuid that silently fails to join. The original value
--     stays in `metadata` as the historical record, so nothing is lost.
--   * scene_id is text and deliberately NOT a foreign key: scenes are a static
--     list in application code (apps/web/data/call-scenes.ts) with slug ids
--     such as 'bartender-after-closing'. There is no scenes table to point at.
--   * scene_modified is nullable on purpose. NULL means "not recorded" - either
--     a pre-migration row or a call with no scene at all - which must stay
--     distinguishable from an explicit false. Do not add a default.
--   * No data is backfilled here. Backfill sql is provided at the bottom of
--     this file to run manually once the migration is applied, per the repo
--     rule that migrations do not carry one-off data fixes.
--   * RLS is unchanged. call_sessions already has RLS enabled and its policies
--     are row-scoped (`auth.uid() = user_id`), so they cover new columns
--     automatically.
--
-- Ordering
--   Apply this BEFORE deploying the sexycall change that writes these columns.
--   The agent inserts a fixed dict, so writing an unknown column would fail the
--   insert and break call creation.
-- =============================================================================

begin;

-- Which character (public preset or user-authored) the call ran.
-- NULL after this migration means either "pre-migration row" (see backfill) or
-- "the character has since been deleted".
alter table public.call_sessions
  add column if not exists character_id uuid
    references public.characters (id) on delete set null;

-- Static scene slug from apps/web/data/call-scenes.ts, or NULL for no scene.
alter table public.call_sessions
  add column if not exists scene_id text;

-- Whether the user edited the scene text away from its shipped default.
-- Nullable: NULL = not recorded, false = used as-is, true = edited.
alter table public.call_sessions
  add column if not exists scene_modified boolean;

comment on column public.call_sessions.character_id is
  'Character the call ran. NULL if the character was deleted (on delete set null) or the call predates this column; metadata->>''character_id'' keeps the original value.';
comment on column public.call_sessions.scene_id is
  'Scene slug from apps/web/data/call-scenes.ts. Text, not a FK: scenes live in application code, not the database.';
comment on column public.call_sessions.scene_modified is
  'True when the user edited the scene text away from its shipped default. NULL means not recorded (no scene, or a pre-migration row).';

-- Postgres does not auto-index foreign keys, and every "calls by character"
-- query needs this one.
create index if not exists call_sessions_character_id_idx
  on public.call_sessions (character_id);

-- No index on scene_id: low cardinality (a handful of slugs) on a table in the
-- low thousands of rows, so a sequential scan wins. Add one if the table grows
-- by orders of magnitude.

commit;


-- --- Verification (run after committing) -------------------------------------
-- Confirm the columns and the foreign key exist:
--   select column_name, data_type, is_nullable
--   from information_schema.columns
--   where table_name = 'call_sessions'
--     and column_name in ('character_id', 'scene_id', 'scene_modified');
--
-- Expected: character_id uuid YES, scene_id text YES, scene_modified boolean YES.


-- --- Backfill (run manually, after applying) ---------------------------------
-- Step 1. Measure the "Unknown character" problem before changing anything.
-- This is the number the calls dashboard has been rendering as Unknown:
--
--   select
--     count(*) filter (where metadata->>'character_id' is null)         as no_character_recorded,
--     count(*) filter (
--       where metadata->>'character_id' is not null
--         and not exists (
--           select 1 from public.characters c
--           where c.id::text = metadata->>'character_id'
--         )
--     )                                                                 as dangling_character_id,
--     count(*)                                                          as total_calls
--   from public.call_sessions;
--
-- A large `dangling_character_id` confirms the cascade-delete theory. A large
-- `no_character_recorded` instead means those calls used the free-form custom
-- instructions path, which never had a character to begin with - a different
-- (and expected) kind of Unknown.

-- Step 2. Copy the still-resolvable ids across. The `exists` guard is required:
-- without it, dangling ids would violate the new foreign key and abort the
-- whole statement. The regex guard is required because `::uuid` raises on
-- malformed text rather than returning null.
--
--   update public.call_sessions cs
--   set character_id = (cs.metadata->>'character_id')::uuid
--   where cs.character_id is null
--     and cs.metadata->>'character_id' ~*
--       '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
--     and exists (
--       select 1 from public.characters c
--       where c.id = (cs.metadata->>'character_id')::uuid
--     );

-- Step 3. Scene fields. Both come from the same metadata blob and neither has
-- a foreign key, so they copy across unguarded.
--
--   update public.call_sessions cs
--   set scene_id = cs.metadata->>'scene_id'
--   where cs.scene_id is null
--     and cs.metadata->>'scene_id' is not null;
--
--   update public.call_sessions cs
--   set scene_modified = (cs.metadata->>'scene_modified')::boolean
--   where cs.scene_modified is null
--     and cs.metadata->>'scene_modified' in ('true', 'false');

-- Step 4. Re-run step 1's query. `dangling_character_id` should be unchanged
-- (those rows are unrecoverable by design) and every resolvable call should now
-- have a non-null character_id:
--
--   select count(*) from public.call_sessions
--   where character_id is null and metadata->>'character_id' is not null;
