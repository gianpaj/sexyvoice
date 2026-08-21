-- Credits-per-minute integrity check for voice calls
--
-- Answers: does what we charged for a call match what its duration says we
-- should have charged? If the credit ledger and the call log disagree, every
-- margin metric built on top of them inherits the error.
--
-- Billing rules (source of truth: sexycall/src/billing.py):
--   - 1000 credits per minute
--   - billed in 30-second buckets, ALWAYS ROUNDED UP -> 500 credits per bucket
--   - calls shorter than 10 seconds are free
--
-- Because buckets round up, the effective rate over BILLABLE seconds can only
-- ever be >= 1000 credits/min. Anything materially BELOW that is a bug, not a
-- rounding effect. The qualifier matters: sub-10-second calls are free, so a
-- rate computed over total duration can dip under 1000 on an account where
-- every charge was correct.
--
-- Known cause to rule out first: billed_minutes was INTEGER until
-- 20260604104100_call_sessions_fractional_mins.sql, while 30-second bucket
-- billing writes 0.5-minute increments. Postgres rejected those writes, which
-- crashed meter_call_session and end_call_session mid-call. Calls in that
-- window can be under-billed through no fault of the current code. Query 4
-- splits the results on that date - check it before concluding anything.
--
-- Usage: run in the Supabase SQL editor. Read-only; nothing here writes.

-- ---------------------------------------------------------------------------
-- 1. Per-call: charged vs expected, worst offenders first
-- ---------------------------------------------------------------------------
with expected as (
  select
    cs.id,
    cs.user_id,
    cs.started_at,
    cs.status,
    cs.end_reason,
    cs.duration_seconds,
    cs.billed_minutes,
    cs.credits_used,
    -- ceil(duration / 30) buckets, or 0 for calls under the 10s floor
    case
      when cs.duration_seconds < 10 then 0
      else ceil(cs.duration_seconds::numeric / 30)
    end * 500 as expected_credits
  from public.call_sessions cs
  where cs.duration_seconds > 0
)
select
  id,
  user_id,
  started_at,
  status,
  end_reason,
  duration_seconds,
  billed_minutes,
  credits_used,
  expected_credits,
  credits_used - expected_credits as delta,
  round(
    (credits_used - expected_credits)::numeric
      / nullif(expected_credits, 0) * 100,
    1
  ) as delta_pct
from expected
where expected_credits > 0
  -- the 5% tolerance asked for in sexycall#55
  and abs(credits_used - expected_credits)::numeric / expected_credits > 0.05
order by abs(credits_used - expected_credits) desc
limit 100;


-- ---------------------------------------------------------------------------
-- 2. Per-user rollup: the effective rate each account actually paid
-- ---------------------------------------------------------------------------
-- A rate well under 1000 means we gave minutes away. Well over means we
-- double-charged - check that direction too, it is the worse failure.
--
-- The rate is computed over BILLABLE seconds only. Calls under 10 seconds are
-- free by design, so counting their duration in the denominator while charging
-- nothing for them in the numerator would drag the rate below 1000 on accounts
-- where every single charge was correct - a false positive on exactly the
-- invariant this file leans on. free_seconds is reported alongside so a user
-- with a lot of very short calls is still visible.
--
-- with per_user as (
--   select
--     cs.user_id,
--     count(*)                                                as calls,
--     sum(cs.duration_seconds)                                as total_seconds,
--     sum(cs.duration_seconds) filter (where cs.duration_seconds >= 10)
--                                                             as billable_seconds,
--     sum(cs.duration_seconds) filter (where cs.duration_seconds < 10)
--                                                             as free_seconds,
--     sum(cs.credits_used)                                    as total_credits,
--     sum(
--       case
--         when cs.duration_seconds < 10 then 0
--         else ceil(cs.duration_seconds::numeric / 30)
--       end * 500
--     )                                                       as expected_credits
--   from public.call_sessions cs
--   where cs.duration_seconds > 0
--   group by cs.user_id
-- )
-- select
--   user_id,
--   calls,
--   round(total_seconds / 60.0, 1)                            as total_minutes,
--   round(coalesce(free_seconds, 0) / 60.0, 1)                as free_minutes,
--   total_credits,
--   expected_credits,
--   round(
--     total_credits / nullif(coalesce(billable_seconds, 0) / 60.0, 0),
--     0
--   )                                                         as effective_credits_per_min,
--   round(
--     (total_credits - expected_credits)::numeric
--       / nullif(expected_credits, 0) * 100,
--     1
--   )                                                         as delta_pct
-- from per_user
-- where total_seconds > 600   -- ignore accounts too small to be meaningful
-- order by abs(total_credits - expected_credits) desc
-- limit 50;


-- ---------------------------------------------------------------------------
-- 3. Ledger vs call log: does usage_events agree with call_sessions?
-- ---------------------------------------------------------------------------
-- Query 1 checks our billing math against duration. This checks the two places
-- we record the same charge against each other. A call present in one and not
-- the other is a lost or duplicated write, not a rounding difference.
--
-- Terminal calls are selected by `ended_at is not null`, not by a list of
-- statuses. The status vocabulary in the original schema comment ('disconnected',
-- 'error') is aspirational - nothing in either repo has ever written those two -
-- so an allow-list would silently miss any status added later, which is exactly
-- the population an integrity check exists to catch.
--
-- select
--   cs.id                                as session_id,
--   cs.user_id,
--   cs.started_at,
--   cs.status,
--   cs.end_reason,
--   cs.credits_used                      as call_credits,
--   coalesce(sum(ue.credits_used), 0)    as usage_event_credits,
--   cs.credits_used - coalesce(sum(ue.credits_used), 0) as delta
-- from public.call_sessions cs
-- left join public.usage_events ue
--   on ue.source_type = 'live_call'
--  and ue.source_id = cs.id
-- where cs.ended_at is not null
--   and cs.duration_seconds >= 10
-- group by cs.id, cs.user_id, cs.started_at, cs.status, cs.end_reason,
--          cs.credits_used
-- having cs.credits_used <> coalesce(sum(ue.credits_used), 0)
-- order by abs(cs.credits_used - coalesce(sum(ue.credits_used), 0)) desc
-- limit 100;


-- ---------------------------------------------------------------------------
-- 4. Is it just the old INTEGER billed_minutes window?
-- ---------------------------------------------------------------------------
-- If the discrepancy sits almost entirely before 2026-06-04, it is the
-- historical crash described in 20260604104100 and the current code is fine.
-- If it continues after, something is still wrong and needs a real fix.
--
-- select
--   case
--     when cs.started_at < '2026-06-04'::timestamptz then 'before numeric fix'
--     else 'after numeric fix'
--   end                                       as era,
--   count(*)                                  as calls,
--   round(sum(cs.duration_seconds) / 60.0, 1) as total_minutes,
--   sum(cs.credits_used)                      as total_credits,
--   round(
--     sum(cs.credits_used) / nullif(sum(cs.duration_seconds) / 60.0, 0),
--     0
--   )                                         as effective_credits_per_min
-- from public.call_sessions cs
-- where cs.duration_seconds >= 10
-- group by 1;


-- ---------------------------------------------------------------------------
-- 5. Calls left stuck 'active' by the same crash
-- ---------------------------------------------------------------------------
-- These never reached end_call_session, so they were never fully billed. Going
-- forward the stale-session sweep labels them end_reason = 'stale_session'.
--
-- select id, user_id, started_at, last_metered_at, duration_seconds, credits_used
-- from public.call_sessions
-- where status = 'active'
--   and started_at < now() - interval '6 hours'
-- order by started_at desc;
