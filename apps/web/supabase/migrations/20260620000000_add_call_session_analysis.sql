-- Automatic call transcript analysis (summary + sentiment) via Grok (xAI).
--
-- When a call ends, the agent flips public.call_sessions.status to 'completed'
-- and writes the final transcript. This migration:
--   1. Adds columns to store the structured analysis and its processing state.
--   2. Fires a Database Webhook (pg_net) that POSTs the session id to the
--      Next.js route handler /api/call-sessions/analyze, which calls Grok and
--      writes the result back to the row.
--
-- The webhook fires only on the transition into 'completed' for a session that
-- has a non-empty transcript and has not already been analysed. The webhook is
-- fire-and-forget: a failure to enqueue must never roll back the call-session
-- update, so missing configuration is tolerated silently and a backfill sweep
-- can reprocess rows where analysis_status is not 'done'.

set search_path = '';

-- 1. Analysis storage. `analysis` is intentionally a single JSONB column so it
-- can grow later (e.g. richer sentiment / topic analysis) without new columns.
alter table public.call_sessions
  add column if not exists analysis jsonb,
  add column if not exists analysis_status text, -- null | 'pending' | 'done' | 'error'
  add column if not exists analysis_generated_at timestamptz;

-- Lets a backfill sweep cheaply find completed calls still needing analysis.
create index if not exists call_sessions_analysis_status_idx
  on public.call_sessions (analysis_status)
  where status = 'completed';

-- 2. Webhook trigger. Requires pg_net for outbound HTTP from Postgres.
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
  -- webhook rather than failing the call_sessions update; the row stays with
  -- analysis_status null and can be picked up by a backfill sweep.
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
    and jsonb_array_length(new.transcript) > 0
    and new.analysis_status is distinct from 'done'
  )
  execute function public.enqueue_call_summary();
