-- =============================================================================
-- Migration: allow fractional billed_minutes on call_sessions
-- =============================================================================
-- 30-second bucket billing records billed_minutes in 0.5-minute increments
-- (e.g. 0.5, 1.0, 10.5). The column was created as INTEGER, so Postgres rejects
-- those writes with:
--     invalid input syntax for type integer: "0.5"
-- which crashes both meter_call_session and end_call_session. That, in turn,
-- makes metering return failure (falsely ending calls as "credit_limit") and
-- leaves sessions stuck in a non-completed/active state.
--
-- This widens the column to NUMERIC so it matches usage_events.quantity (which
-- is already numeric and stores values like 11.00). Existing integer values
-- convert losslessly.
-- =============================================================================

BEGIN;

ALTER TABLE call_sessions
    ALTER COLUMN billed_minutes TYPE numeric(10, 2)
    USING billed_minutes::numeric(10, 2);

COMMIT;


-- --- Verification (run after committing) -------------------------------------
-- Confirm the new type:
--   SELECT column_name, data_type, numeric_precision, numeric_scale
--   FROM information_schema.columns
--   WHERE table_name = 'call_sessions' AND column_name = 'billed_minutes';
-- Expected: data_type = 'numeric'.


-- --- Optional: clean up sessions left stuck by the failed writes -------------
-- Calls that errored out before finalizing stay in status 'active'. Inspect
-- first, then mark them completed so they don't block new calls (the app also
-- auto-cleans stale 'active' sessions to 'completed-manually' on the next call).
--
-- Target ONLY 'active' sessions -- do not touch terminal states like
-- 'completed' or 'completed-manually', or you'll corrupt their end state.
--
--   SELECT id, user_id, status, started_at, last_metered_at, ended_at
--   FROM call_sessions
--   WHERE status = 'active'
--     AND started_at < now() - interval '15 minutes'
--   ORDER BY started_at DESC;
--
-- UPDATE call_sessions
-- SET status = 'completed', end_reason = COALESCE(end_reason, 'billing_error')
-- WHERE status = 'active'
--   AND started_at < now() - interval '15 minutes';
