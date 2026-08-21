-- =============================================================================
-- Migration: harden call_sessions.end_reason
-- =============================================================================
-- Purpose
--   end_reason is the field that makes every other call metric interpretable -
--   without it a 25-second call and a 25-second failure are the same row. It
--   already exists and is already populated by the agent, but it is nullable,
--   has no default, and its vocabulary is documented nowhere.
--
--   This migration gives it a default of 'unknown', makes it NOT NULL, and
--   writes the taxonomy down as a column comment so it stops being folklore.
--
-- Affected objects
--   public.call_sessions.end_reason - default, NOT NULL, comment
--
-- Taxonomy (as written by the agent today, sexycall/src/agent.py)
--   user_disconnect       the participant left; also the default clean ending
--   credit_limit          the user's balance hit zero mid-call
--   duration_limit        the call hit the hard length cap
--   billing_error         metering/billing failed and forced the call down
--   instructions_rejected the provider refused the session instructions
--   stale_session         force-closed by the stale-session sweep; the agent
--                         never finalized the call (process died, participant
--                         vanished without a clean disconnect). Written by the
--                         matching sexycall change, not by this migration.
--   unknown               not recorded
--
--   The original table comment also listed 'error', 'agent_unavailable' and
--   'timeout'. No current code path writes any of them; they may exist on old
--   rows. They are left alone rather than remapped - remapping would be
--   guessing.
--
-- Why there is no CHECK constraint
--   end_reason is written in the same UPDATE that records duration, billed
--   minutes and credits (`end_record` in sexycall's end_call_session). A CHECK
--   violation there would fail the billing write, not just the telemetry - so
--   an unexpected value must degrade to a bad label, never to a lost charge.
--   The taxonomy is documented and enforced by code review, not by the
--   database.
--
-- Ordering relative to the sexycall deploy
--   Safe to apply at any time; no agent change is required first. A column
--   default only applies when the key is ABSENT from the insert - PostgREST
--   forwards an explicit JSON null as a literal NULL, which would violate the
--   new constraint. Checked the agent's actual insert shape rather than assuming
--   it: sexycall's `create_call_session` builds a fixed dict that does not
--   contain an `end_reason` key at all, so the default applies and every new
--   row satisfies NOT NULL.
--
--   The constraint this creates for sexycall: never add `end_reason` to that
--   insert with a None value. Set a real reason or omit the key.
--
-- Backfill
--   The UPDATE below is not a data fix; `set not null` cannot be applied while
--   NULLs remain, so it is a precondition of the DDL and belongs here. Historic
--   rows become 'unknown' - deliberately NOT guessed from duration or status,
--   because an inferred reason would be indistinguishable from a recorded one
--   in every chart built afterwards.
--
-- Locking
--   `set not null` takes an ACCESS EXCLUSIVE lock and scans the table. At this
--   table's size (low thousands of rows) that is effectively instant.
--
-- Note on in-progress calls
--   A call that has not ended yet now reads 'unknown' rather than NULL. Use
--   `status = 'active'` to identify those; do not read 'unknown' as "ended for
--   an unknown reason" without checking it.
--
--   Use status, NOT `ended_at is null`. The manual cleanup SQL documented in
--   20260604104100_call_sessions_fractional_mins.sql moves rows out of 'active'
--   while setting status and end_reason but never ended_at, so a terminal row
--   can carry a NULL ended_at. Conversely nothing writes ended_at while a call
--   is still running. "Not active" is the reliable test in both directions.
--
-- Note for writers: `coalesce(end_reason, ...)` is now dead code
--   Any cleanup SQL of the form
--       set end_reason = coalesce(end_reason, 'billing_error')
--   becomes a silent no-op after this migration - end_reason is never NULL, so
--   the coalesce always keeps the existing 'unknown' and the intended label is
--   never applied. No error is raised, which is what makes it dangerous.
--   20260604104100_call_sessions_fractional_mins.sql carries exactly such a
--   snippet in its commented cleanup block.
--
--   Rewrite those as an explicit `where end_reason = 'unknown'` guard:
--       update public.call_sessions
--       set status = 'completed', end_reason = 'billing_error'
--       where status = 'active'
--         and end_reason = 'unknown'
--         and started_at < now() - interval '15 minutes';
-- =============================================================================

begin;

-- New rows start as 'unknown' and are overwritten when the call is finalized.
alter table public.call_sessions
  alter column end_reason set default 'unknown';

-- Precondition for `set not null` - see the Backfill note above.
update public.call_sessions
set end_reason = 'unknown'
where end_reason is null;

alter table public.call_sessions
  alter column end_reason set not null;

comment on column public.call_sessions.end_reason is
  'Why the call ended. One of: user_disconnect, credit_limit, duration_limit, billing_error, instructions_rejected, stale_session, unknown. Older rows may also hold error/agent_unavailable/timeout. Defaults to ''unknown'' at insert and is overwritten when the call is finalized, so check status/ended_at before reading ''unknown'' as a real outcome.';

commit;


-- --- Verification (run after committing) -------------------------------------
-- Confirm the constraint and default:
--   select column_name, is_nullable, column_default
--   from information_schema.columns
--   where table_name = 'call_sessions' and column_name = 'end_reason';
-- Expected: is_nullable = 'NO', column_default = '''unknown''::text'.
--
-- See the current distribution, and how much of it is genuinely unexplained.
-- Terminal calls still reading 'unknown' are the population sexycall#55 exists
-- to shrink:
--   select end_reason, status, count(*)
--   from public.call_sessions
--   group by end_reason, status
--   order by count(*) desc;
