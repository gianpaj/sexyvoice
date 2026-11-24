set search_path = '';

-- Add a new effective row to change pricing. Existing runs retain their version.
create table public.voice_chat_rates (
  version text primary key,
  effective_at timestamptz not null unique,
  model text not null,
  input_token_limit integer not null check (input_token_limit between 1 and 16384),
  output_token_limit integer not null check (output_token_limit between 32 and 1024),
  input_credits_per_million integer not null check (input_credits_per_million > 0),
  cached_credits_per_million integer not null check (
    cached_credits_per_million between 0 and input_credits_per_million
  ),
  output_credits_per_million integer not null check (output_credits_per_million > 0),
  input_usd_per_million numeric(8, 4) not null check (input_usd_per_million >= 0),
  cached_usd_per_million numeric(8, 4) not null check (cached_usd_per_million >= 0),
  output_usd_per_million numeric(8, 4) not null check (output_usd_per_million >= 0)
);
alter table public.voice_chat_rates enable row level security;
revoke all on public.voice_chat_rates from public, anon, authenticated, service_role;
grant select on public.voice_chat_rates to service_role;

insert into public.voice_chat_rates values (
  'grok420-chat-v1', '-infinity', 'grok-4.20-0309-non-reasoning',
  16384, 1024, 50000, 10000, 100000, 1.25, 0.20, 2.50
);

alter table public.voice_chat_runs
  add column rate_version text references public.voice_chat_rates(version),
  add column reserved_credits integer not null default 0 check (reserved_credits >= 0);

create index voice_chat_runs_pending_billing_idx on public.voice_chat_runs (expires_at)
  where status = 'streaming' and reserved_credits > 0;

-- The run state and the wallet commit together, including when account erasure
-- cascades into a run. Legacy receipts have no reservation.
create function public.bill_voice_chat_run()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  rate public.voice_chat_rates;
  balance integer;
  input_tokens integer;
  cached_tokens integer;
  output_tokens integer;
  charge integer := 0;
  computed_charge numeric;
begin
  if tg_op = 'INSERT' then
    select * into strict rate from public.voice_chat_rates
      where effective_at <= pg_catalog.clock_timestamp()
      order by effective_at desc limit 1;

    -- Admission holds the same per-user advisory lock as the producer and reaper.
    update public.voice_chat_runs set status = 'interrupted'
      where user_id = new.user_id and status = 'streaming' and reserved_credits > 0
        and expires_at <= pg_catalog.clock_timestamp();

    select amount into balance from public.credits where user_id = new.user_id for update;
    if coalesce(balance, 0) <= 0 then
      raise exception 'Insufficient chat credits' using errcode = 'SV402';
    end if;
    new.rate_version := rate.version;
    -- Also enforced in the producer before invoking Grok.
    new.reserved_credits := least(balance, ceil(
      (rate.input_token_limit::numeric * rate.input_credits_per_million +
        rate.output_token_limit::numeric * rate.output_credits_per_million) / 1000000
    )::integer);
    update public.credits set amount = amount - new.reserved_credits, updated_at = now()
      where user_id = new.user_id;
    return new;
  end if;

  if old.status = 'streaming' and old.reserved_credits > 0
    and (tg_op = 'DELETE' or new.status <> 'streaming') then
    if tg_op = 'UPDATE'
      and jsonb_typeof(new.usage->'promptTokens') = 'number'
      and jsonb_typeof(new.usage->'promptCachedTokens') = 'number'
      and jsonb_typeof(new.usage->'completionTokens') = 'number'
      and new.usage->>'promptTokens' ~ '^[0-9]{1,9}$'
      and new.usage->>'promptCachedTokens' ~ '^[0-9]{1,9}$'
      and new.usage->>'completionTokens' ~ '^[0-9]{1,9}$' then
      input_tokens := (new.usage->>'promptTokens')::integer;
      cached_tokens := (new.usage->>'promptCachedTokens')::integer;
      output_tokens := (new.usage->>'completionTokens')::integer;
      if cached_tokens <= input_tokens and input_tokens + output_tokens > 0 then
        select * into strict rate from public.voice_chat_rates where version = old.rate_version;
        computed_charge := ceil((
          (input_tokens - cached_tokens)::numeric * rate.input_credits_per_million +
          cached_tokens::numeric * rate.cached_credits_per_million +
          output_tokens::numeric * rate.output_credits_per_million
        ) / 1000000);
        charge := least(old.reserved_credits, computed_charge)::integer;

        insert into public.usage_events (
          user_id, source_type, source_id, unit, quantity, credits_used, model, dollar_amount, metadata
        ) values (
          old.user_id, 'text_chat', old.id, 'tokens', input_tokens + output_tokens, charge, rate.model,
          (
            (input_tokens - cached_tokens) * rate.input_usd_per_million +
            cached_tokens * rate.cached_usd_per_million +
            output_tokens * rate.output_usd_per_million
          ) / 1000000,
          pg_catalog.jsonb_build_object(
            'rate_version', rate.version, 'token_usage', new.usage,
            'provider_cost', pg_catalog.jsonb_build_object('status', 'estimated'),
            'reservation_exceeded', computed_charge > old.reserved_credits
          )
        );
      end if;
    end if;

    update public.credits set amount = amount + (old.reserved_credits - charge), updated_at = now()
      where user_id = old.user_id and old.reserved_credits > charge;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.bill_voice_chat_run() from public, anon, authenticated;
create trigger bill_voice_chat_run
before insert or update of status or delete on public.voice_chat_runs
for each row execute function public.bill_voice_chat_run();

create function public.expire_voice_chat_runs()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  candidate record;
  expired integer := 0;
begin
  for candidate in
    select user_id, id from public.voice_chat_runs
      where status = 'streaming' and reserved_credits > 0 and expires_at <= pg_catalog.clock_timestamp()
      order by expires_at limit 100
  loop
    if pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended(candidate.user_id::text, 71903)) then
      update public.voice_chat_runs set status = 'interrupted'
        where user_id = candidate.user_id and id = candidate.id and status = 'streaming'
          and expires_at <= pg_catalog.clock_timestamp();
      if found then
        delete from public.voice_conversation_leases
          where user_id = candidate.user_id and room_name = 'chat:' || candidate.id
            and expires_at <= pg_catalog.clock_timestamp();
        expired := expired + 1;
      end if;
    end if;
  end loop;
  return expired;
end;
$$;

revoke all on function public.expire_voice_chat_runs() from public, anon, authenticated;
select cron.schedule('expire-voice-chat-runs', '* * * * *', $$select public.expire_voice_chat_runs()$$);

create or replace function public.read_voice_chat(p_user_id uuid, p_run_id uuid)
returns table (thread_id uuid, status text, reply text)
language sql
stable
security invoker
set search_path = ''
as $$
  select run.conversation_id,
    case
      when run.status = 'streaming' and run.expires_at <= pg_catalog.now() then 'interrupted'
      when run.status = 'interrupted' and run.usage->>'failure' = 'insufficient_credits' then 'insufficient_credits'
      else run.status
    end,
    coalesce(message.parts->0->>'content', '')
  from public.voice_chat_runs as run
  left join public.conversation_messages as message
    on message.conversation_id = run.conversation_id and message.id = 'chat-assistant:' || run.id
  where run.user_id = p_user_id and run.id = p_run_id;
$$;
