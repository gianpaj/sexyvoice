-- Add external API source types to usage tracking.
alter type public.usage_source_type add value if not exists 'api_tts';
alter type public.usage_source_type add value if not exists 'api_voice_cloning';

-- Extend usage_events with API usage dimensions and explicit currency amount.
alter table public.usage_events
  add column if not exists api_key_id uuid references public.api_keys(id) on delete set null,
  add column if not exists model text,
  add column if not exists input_chars integer check (input_chars is null or input_chars >= 0),
  add column if not exists output_chars integer check (output_chars is null or output_chars >= 0),
  add column if not exists duration_seconds numeric(12, 2) check (duration_seconds is null or duration_seconds >= 0),
  add column if not exists dollar_amount numeric(12, 6) check (dollar_amount is null or dollar_amount >= 0);

-- Allow zero-credit events (for cache hits or promotional/free API calls).
alter table public.usage_events
  drop constraint if exists usage_events_credits_used_check;

alter table public.usage_events
  add constraint usage_events_credits_used_check check (credits_used >= 0);

create index if not exists usage_events_api_key_id_idx
  on public.usage_events(api_key_id)
  where api_key_id is not null;

create index if not exists usage_events_user_source_occurred_idx
  on public.usage_events(user_id, source_type, occurred_at desc);

create index if not exists usage_events_user_api_key_occurred_idx
  on public.usage_events(user_id, api_key_id, occurred_at desc)
  where api_key_id is not null;

create index if not exists usage_events_user_model_occurred_idx
  on public.usage_events(user_id, model, occurred_at desc)
  where model is not null;

-- Daily aggregate view for dashboard billing analytics.
create or replace view public.api_usage_daily
with (security_invoker = on) as
select
  ue.user_id,
  date_trunc('day', ue.occurred_at) as usage_date,
  ue.source_type,
  ue.api_key_id,
  ue.model,
  count(*)::bigint as requests,
  sum(coalesce(ue.input_chars, 0))::bigint as total_input_chars,
  sum(coalesce(ue.output_chars, 0))::bigint as total_output_chars,
  sum(coalesce(ue.duration_seconds, 0))::numeric(12, 2) as total_duration_seconds,
  sum(coalesce(ue.dollar_amount, 0))::numeric(18, 6) as total_dollar_amount,
  sum(coalesce(ue.credits_used, 0))::bigint as total_credits_used
from public.usage_events ue
where ue.source_type::text in (
  'api_tts',
  'api_voice_cloning'
)
group by
  ue.user_id,
  date_trunc('day', ue.occurred_at),
  ue.source_type,
  ue.api_key_id,
  ue.model
order by usage_date desc;

grant select on public.api_usage_daily to authenticated;
grant select on public.api_usage_daily to service_role;
