-- Add request correlation id for external API debugging/tracing.
alter table public.usage_events
  add column if not exists request_id text;

create index if not exists usage_events_request_id_idx
  on public.usage_events(request_id)
  where request_id is not null;

comment on column public.usage_events.request_id is
  'External API request identifier returned in response header request-id for debugging and Sentry correlation.';
