-- =============================================================================
-- Migration: create call_turns - per-response latency telemetry for voice calls
-- =============================================================================
-- Purpose
--   "How long before the AI starts talking back" is the number that decides
--   whether a voice call feels alive, and we have never stored it. Transcript
--   timestamps cannot supply it: they are written when a message is committed,
--   not when the first audio byte reaches the user.
--
--   The data already exists. LiveKit emits RealtimeModelMetrics for every
--   response, carrying `ttft` - documented upstream as "Time to first audio
--   token in seconds" - and the agent's metrics handler has been receiving it
--   all along while keeping only `request_id` and discarding the rest.
--
--   This table is where the rest of it lands.
--
-- Affected objects
--   public.call_turns (new)
--
-- Scope
--   Deliberately narrow: one row per model response, six meaningful columns.
--   Per-stage STT/LLM/TTS timings are not here and cannot be - the agent runs
--   a speech-to-speech realtime model (xai.realtime.RealtimeModel), so there
--   are no separate stages to time. Per-turn token counts are not here either;
--   session-level usage is already recorded on usage_events.
--
-- Access
--   Service-role only, like call_session_analysis. RLS is enabled with no
--   policies, so anon/authenticated clients cannot read it. This is internal
--   telemetry, and the row count per user is itself a usage signal.
-- =============================================================================

begin;

create table if not exists public.call_turns (
  id bigint generated always as identity primary key,

  session_id uuid not null
    references public.call_sessions (id) on delete cascade,

  -- 0-based position of this response within the call, in emission order.
  turn_index integer not null,

  -- Provider correlation id (xAI response id), for tracing one turn back to
  -- the provider's own logs.
  request_id text,

  -- Time to first audio token, in milliseconds. NULL when the response
  -- produced no audio at all - LiveKit signals that with ttft = -1, which must
  -- not be stored as a latency of minus one second.
  ttft_ms integer,

  -- Response created -> done, in milliseconds.
  duration_ms integer,

  -- The response was cancelled before finishing. On a realtime model this is
  -- overwhelmingly the user interrupting - a barge-in. Worth keeping separate
  -- from latency: interrupting is what engaged users do, so this is not a
  -- fault counter.
  cancelled boolean not null default false,

  -- Provider-reported response creation time, so a turn can be lined up
  -- against the transcript timeline. NULL when the provider reports something
  -- that is not a plausible wall-clock timestamp.
  response_created_at timestamptz,

  created_at timestamptz not null default now(),

  -- Idempotency: a retried flush cannot duplicate a turn. Doubles as the index
  -- for every "turns of this call, in order" read.
  unique (session_id, turn_index)
);

comment on table public.call_turns is
  'Per-response latency telemetry for voice calls, from LiveKit RealtimeModelMetrics. Written in one batch at call end; a call that crashed may have none.';
comment on column public.call_turns.ttft_ms is
  'Time to first audio token in milliseconds. NULL when the response emitted no audio (LiveKit reports ttft = -1).';
comment on column public.call_turns.cancelled is
  'Response cancelled before completion - on a realtime model, almost always a user barge-in. An engagement signal, not a fault.';

alter table public.call_turns enable row level security;

-- No policies: service-role only, matching call_session_analysis.

commit;


-- --- Verification (run after committing) -------------------------------------
-- Rows should start appearing once the matching sexycall change is deployed.
-- A call that crashed before finalizing will have no turns at all - the flush
-- happens once, at call end, so it cannot slow the audio path.
--
--   select count(*) as turns, count(distinct session_id) as calls
--   from public.call_turns;
--
-- Time to first audio, p50/p95, grouped by language. Language lives in
-- call_sessions.metadata, written when the call is finalized:
--
--   select
--     coalesce(cs.metadata->>'language', 'unknown') as language,
--     count(*)                                       as turns,
--     percentile_cont(0.5) within group (order by ct.ttft_ms) as p50_ttft_ms,
--     percentile_cont(0.95) within group (order by ct.ttft_ms) as p95_ttft_ms
--   from public.call_turns ct
--   join public.call_sessions cs on cs.id = ct.session_id
--   where ct.ttft_ms is not null
--     and cs.started_at > now() - interval '7 days'
--   group by 1
--   order by turns desc;
--
-- Barge-in rate per call - how often users interrupt:
--
--   select
--     ct.session_id,
--     count(*)                                  as turns,
--     count(*) filter (where ct.cancelled)      as barge_ins
--   from public.call_turns ct
--   group by 1
--   order by barge_ins desc
--   limit 20;
--
-- Caveat worth remembering before reading any of this as a per-language
-- verdict: at current volume a single language can take months to accumulate a
-- stable p95. For a question about the pipeline itself, a synthetic probe -
-- N scripted calls per language - answers it far sooner than organic traffic.
