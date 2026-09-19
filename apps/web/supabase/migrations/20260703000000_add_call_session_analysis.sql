-- Automatic call transcript analysis (rich schema) via Grok (xAI).
--
-- When a call ends, the agent flips public.call_sessions.status to 'completed'
-- and writes the final transcript. This migration:
--   1. Creates call_session_analysis (one rich row per analysed call) and
--      call_session_analytics (aggregate insights per analysis run).
--   2. Fires a Database Webhook (pg_net) on the transition into 'completed' that
--      POSTs the session id to /api/call-sessions/analyze, which calls Grok and
--      inserts a call_session_analysis row.
--
-- Both the route and scripts/analyze-call-sessions.mjs write the same shape.
-- The webhook is fire-and-forget: a failure to enqueue must never roll back the
-- call_sessions update, so missing configuration is tolerated silently and the
-- backfill script reprocesses sessions that still have no analysis row.

set search_path = '';

-- 1. Per-call analysis: one row per analysed call session.
create table if not exists public.call_session_analysis (
  id uuid primary key default gen_random_uuid(),
  -- One analysis row per call (1:1). The unique constraint enforces idempotency
  -- at the DB level and is the conflict target for the route/script upserts.
  -- Safe because neither the route nor the scripts persist rows for failed
  -- analyses, so a session never has more than a single (successful) row.
  session_id uuid not null unique references public.call_sessions(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  started_at timestamptz,
  duration_seconds integer,
  end_reason text,

  -- Primary language detected (ISO 639-1: en, es, de, fr, ...).
  language text,
  -- High-level topic: roleplay_intimate, roleplay_fantasy, casual_chat,
  -- emotional_support, asmr_relaxation, fetish_content, other.
  topic_category text,
  topic_subcategory text,
  -- high | medium | low | minimal
  engagement_level text,
  -- flowing | choppy | one_sided | dying
  conversation_quality text,
  -- what caused disengagement, or null if the conversation flowed well
  where_died text,
  -- satisfied | frustrated | bored | engaged | confused
  user_sentiment text,
  -- array of main things the user asked for or wanted
  key_requests jsonb default '[]'::jsonb,
  -- any issues with AI responses, or null
  ai_issues text,
  notable_patterns text,

  -- error message if analysis failed (set by the backfill/recent scripts)
  error text,
  analyzed_at timestamptz default now(),
  created_at timestamptz default now()
);

-- Note: session_id already has a unique index from the UNIQUE constraint above.
create index if not exists idx_call_session_analysis_user_id
  on public.call_session_analysis (user_id);
create index if not exists idx_call_session_analysis_started_at
  on public.call_session_analysis (started_at desc);
create index if not exists idx_call_session_analysis_language
  on public.call_session_analysis (language);
create index if not exists idx_call_session_analysis_topic_category
  on public.call_session_analysis (topic_category);
create index if not exists idx_call_session_analysis_engagement_level
  on public.call_session_analysis (engagement_level);

-- Service-role only (admin client / scripts); no public policies.
alter table public.call_session_analysis enable row level security;

-- 2. Aggregated insights, one row per analysis run (e.g. daily cron / backfill).
create table if not exists public.call_session_analytics (
  id uuid primary key default gen_random_uuid(),
  analysis_date timestamptz not null default now(),
  time_range_hours integer not null,
  total_sessions_analyzed integer not null,
  insights jsonb not null,
  created_at timestamptz default now()
);

create index if not exists idx_call_session_analytics_date
  on public.call_session_analytics (analysis_date desc);

alter table public.call_session_analytics enable row level security;

-- 3. Webhook trigger. Requires pg_net for outbound HTTP from Postgres.
create extension if not exists pg_net with schema extensions;

create or replace function public.enqueue_call_summary()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_base_url text;
  v_secret text;
begin
  -- Read configuration from Supabase Vault. If either is missing we skip the
  -- webhook rather than failing the call_sessions update; the row stays without
  -- a call_session_analysis row and can be picked up by the backfill script.
  select decrypted_secret into v_base_url
  from vault.decrypted_secrets
  where name = 'app_base_url';

  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'call_summary_secret';

  if v_base_url is null or v_secret is null then
    return new;
  end if;

  perform net.http_post(
    url := rtrim(v_base_url, '/') || '/api/call-sessions/analyze',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    body := jsonb_build_object('id', new.id)
  );

  return new;
end;
$$;

drop trigger if exists call_sessions_summarize_trigger on public.call_sessions;

create trigger call_sessions_summarize_trigger
  after update on public.call_sessions
  for each row
  when (
    new.status = 'completed'
    and old.status is distinct from 'completed'
    and new.transcript is not null
    and new.transcript not in ('[]'::jsonb, '{}'::jsonb, 'null'::jsonb)
  )
  execute function public.enqueue_call_summary();
