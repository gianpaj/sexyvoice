set search_path = '';

-- Outlast the six-minute call lease, two-minute dispatch token, and chat run.
alter table public.account_conversation_erasures
  add column blocked_until timestamptz not null
  default (pg_catalog.clock_timestamp() + interval '10 minutes');
grant update (blocked_until) on public.account_conversation_erasures to service_role;

create or replace function public.reject_erased_account_conversation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.user_id::text, 71903));
  if exists (
    select from public.account_conversation_erasures
      where user_id = new.user_id and blocked_until > pg_catalog.clock_timestamp()
  ) then
    raise exception 'Conversation unavailable' using errcode = 'P0002';
  end if;
  return new;
end;
$$;

create or replace function public.erase_account_conversations(p_user_id uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  deleted_count integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 71903));
  insert into public.account_conversation_erasures (user_id)
    values (p_user_id)
    on conflict (user_id) do update set blocked_until = excluded.blocked_until;
  delete from public.conversations where user_id = p_user_id;
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;
