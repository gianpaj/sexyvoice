-- Provider attempts carry estimated supplier cost; customer events carry credits.
alter table public.usage_events
  add column event_kind text not null default 'customer_usage'
    check (event_kind in ('customer_usage', 'provider_attempt')),
  add column input_tokens bigint check (input_tokens >= 0),
  add column output_tokens bigint check (output_tokens >= 0),
  add column total_tokens bigint check (total_tokens >= 0),
  add constraint usage_events_provider_credits_check
    check (event_kind <> 'provider_attempt' or credits_used = 0);

comment on column public.usage_events.input_tokens is 'Provider-reported prompt tokens. NULL means unavailable.';
comment on column public.usage_events.output_tokens is 'Provider-reported candidate tokens. NULL means unavailable.';
comment on column public.usage_events.total_tokens is 'Provider-reported total tokens. Not derived from input and output.';
comment on column public.usage_events.event_kind is 'Customer credit consumption or provider attempt. Gemini cost and tokens belong to provider attempts.';

CREATE OR REPLACE FUNCTION public.get_usage_summary(
  p_user_id UUID,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  source_type public.usage_source_type,
  total_credits BIGINT,
  operation_count BIGINT
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ue.source_type,
    COALESCE(SUM(ue.credits_used)::BIGINT, 0) AS total_credits,
    COUNT(*)::BIGINT AS operation_count
  FROM public.usage_events ue
  WHERE ue.user_id = p_user_id
    AND ue.event_kind = 'customer_usage'
    AND (p_start_date IS NULL OR ue.occurred_at >= p_start_date)
    AND (p_end_date IS NULL OR ue.occurred_at < p_end_date)
  GROUP BY ue.source_type;
END;
$$;

create or replace view public.api_usage_daily
with (security_invoker = on) as
select
  ue.user_id,
  date_trunc('day', ue.occurred_at) as usage_date,
  ue.source_type,
  ue.api_key_id,
  ue.model,
  count(*) filter (where ue.event_kind = 'customer_usage')::bigint as requests,
  coalesce(sum(coalesce(ue.input_chars, 0)) filter (where ue.event_kind = 'customer_usage'), 0)::bigint as total_input_chars,
  coalesce(sum(coalesce(ue.output_chars, 0)) filter (where ue.event_kind = 'customer_usage'), 0)::bigint as total_output_chars,
  coalesce(sum(coalesce(ue.duration_seconds, 0)) filter (where ue.event_kind = 'customer_usage'), 0)::numeric(12, 2) as total_duration_seconds,
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
