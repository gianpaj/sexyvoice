set search_path = '';

-- A linked Python call uses its billing row for admission and turn ownership.
-- Legacy calls keep a NULL room and conversation ID.
alter table public.call_sessions add column livekit_room_name text;
create unique index call_sessions_livekit_room_name_key
  on public.call_sessions (livekit_room_name) where livekit_room_name is not null;

create function public.guard_conversation_admission()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_table_name = 'call_sessions' then
    if new.status <> 'active' then
      return new;
    end if;
    if tg_op = 'UPDATE' and old.status = 'active'
        and new.user_id = old.user_id then
      return new;
    end if;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.user_id::text, 71903));

  if exists (select from public.call_sessions where user_id = new.user_id and status = 'active')
    or (tg_table_name = 'call_sessions' and exists (
      select from public.voice_conversation_leases
      where user_id = new.user_id and expires_at > pg_catalog.clock_timestamp()
    )) then
    raise exception 'Another call or reply is in progress'
      using errcode = '23505', constraint = 'conversation_admission';
  end if;

  return new;
end;
$$;

create trigger guard_active_call_session
  before insert or update of status, user_id on public.call_sessions
  for each row execute function public.guard_conversation_admission();

create trigger guard_voice_conversation_lease
  before insert or update of user_id, expires_at on public.voice_conversation_leases
  for each row execute function public.guard_conversation_admission();

create function public.has_active_voice_call(p_user_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select from public.call_sessions where user_id = p_user_id and status = 'active'
  ) or exists (
    select from public.voice_conversation_leases
    where user_id = p_user_id and room_name not like 'chat:%'
      and expires_at > pg_catalog.statement_timestamp()
  );
$$;

-- Check the same call identity that owns admission before committing a turn.
create or replace function public.append_voice_call_message(
  p_user_id uuid, p_conversation_id uuid, p_room_name text,
  p_item_id text, p_role text, p_text text, p_interrupted boolean
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  linked_call_id uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 71903));
  perform 1 from public.conversations
    where id = p_conversation_id and user_id = p_user_id for update;
  if not found then
    raise exception 'Conversation unavailable' using errcode = 'P0002';
  end if;

  select id into linked_call_id from public.call_sessions
    where user_id = p_user_id and conversation_id = p_conversation_id
      and livekit_room_name = p_room_name and status = 'active'
    for share;
  if not found then
    perform 1 from public.voice_conversation_leases
      where user_id = p_user_id and conversation_id = p_conversation_id
        and room_name = p_room_name and expires_at > pg_catalog.clock_timestamp()
      for share;
    if not found then
      raise exception 'Voice call is no longer active' using errcode = 'P0002';
    end if;
  end if;

  insert into public.conversation_messages (
    conversation_id, id, position, role, source, parts, status, source_item_id, call_session_id
  ) values (
    p_conversation_id, p_room_name || ':' || p_item_id,
    (select coalesce(max(position), 0) + 1 from public.conversation_messages
      where conversation_id = p_conversation_id),
    p_role, 'voice',
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('type', 'text', 'content', p_text)),
    case when p_interrupted then 'interrupted' else 'completed' end, p_item_id, linked_call_id
  )
  on conflict (conversation_id, id) do nothing;
end;
$$;

revoke all on function public.guard_conversation_admission(),
  public.has_active_voice_call(uuid) from public, anon, authenticated;
grant execute on function public.guard_conversation_admission(),
  public.has_active_voice_call(uuid) to service_role;
