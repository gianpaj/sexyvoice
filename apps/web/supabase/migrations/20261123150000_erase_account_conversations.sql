set search_path = '';

create table public.account_conversation_erasures (
  user_id uuid primary key references auth.users (id) on delete cascade
);
alter table public.account_conversation_erasures enable row level security;
revoke all on public.account_conversation_erasures from public, anon, authenticated;
grant select, insert on public.account_conversation_erasures to service_role;

create function public.reject_erased_account_conversation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Serialize with erasure and the existing chat and call admission RPCs.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.user_id::text, 71903));
  if exists (select from public.account_conversation_erasures where user_id = new.user_id) then
    raise exception 'Conversation unavailable' using errcode = 'P0002';
  end if;
  return new;
end;
$$;

create trigger reject_erased_account_conversation
before insert or update of user_id on public.conversations
for each row execute function public.reject_erased_account_conversation();

create function public.erase_account_conversations(p_user_id uuid)
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
    values (p_user_id) on conflict (user_id) do nothing;
  delete from public.conversations where user_id = p_user_id;
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.reject_erased_account_conversation() from public, anon, authenticated;
revoke all on function public.erase_account_conversations(uuid) from public, anon, authenticated;
grant execute on function public.erase_account_conversations(uuid) to service_role;
