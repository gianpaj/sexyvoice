-- Call transcript analysis queue for the xAI Batch API.
--
-- Purpose: move the LLM call off the /api/call-sessions/analyze webhook. The
-- webhook now only records intent by inserting a `pending` row here; the
-- /api/call-sessions/analyze/batch cron coalesces pending rows into one xAI
-- batch, records the batch id, and writes call_session_analysis rows when the
-- batch settles.
--
-- Affected objects: new table public.call_analysis_queue (+ indexes, RLS).
--
-- Lifecycle: pending -> submitted -> completed | failed. Failed rows keep no
-- call_session_analysis row, so the backfill script (which anti-joins on that
-- table) can still reprocess them. A retryable failure goes back to `pending`
-- until `attempts` reaches the app-side limit.

set search_path = '';

create table if not exists public.call_analysis_queue (
  -- One queue row per call (1:1): the primary key makes the webhook's
  -- "insert if absent" idempotent under duplicate deliveries.
  session_id uuid primary key references public.call_sessions(id) on delete cascade,
  -- pending | submitted | completed | failed
  status text not null default 'pending'
    check (status in ('pending', 'submitted', 'completed', 'failed')),
  -- xAI batch id the session was last submitted in (null while pending).
  xai_batch_id text,
  -- Number of batch submissions so far; bounds retries app-side.
  attempts integer not null default 0,
  last_error text,
  queued_at timestamptz not null default now(),
  submitted_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

comment on table public.call_analysis_queue is
  'Pending/in-flight xAI Batch API transcript analyses, drained by /api/call-sessions/analyze/batch.';

-- The drain job selects pending rows in FIFO order and groups in-flight rows
-- by batch id.
create index if not exists idx_call_analysis_queue_status_queued_at
  on public.call_analysis_queue (status, queued_at);
create index if not exists idx_call_analysis_queue_xai_batch_id
  on public.call_analysis_queue (xai_batch_id)
  where xai_batch_id is not null;

-- Service-role only (admin client in route handlers); no anon/authenticated
-- policies, so RLS denies every non-service request.
alter table public.call_analysis_queue enable row level security;
