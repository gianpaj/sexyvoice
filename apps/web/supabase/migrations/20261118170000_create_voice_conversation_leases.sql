set search_path = '';

alter table public.conversations add column uses_default_character boolean not null default false;
comment on column public.conversations.uses_default_character is
  'Allows a thread using the default character to resume without a character ID. Threads with a deleted character stay read-only.';

create table public.voice_conversation_leases (
  user_id uuid primary key,
  conversation_id uuid not null,
  room_name text not null,
  expires_at timestamptz not null,
  foreign key (conversation_id, user_id) references public.conversations (id, user_id)
    on delete cascade
);
alter table public.voice_conversation_leases enable row level security;
revoke all on public.voice_conversation_leases from public, anon, authenticated;
grant select, insert, update, delete on public.voice_conversation_leases to service_role;

comment on table public.voice_conversation_leases is
  'One active LiveKit call or text reply per account. The room name identifies the holder, using chat:<run-id> for a text reply.';

create function public.open_voice_call(
  p_user_id uuid, p_conversation_id uuid, p_resume boolean, p_room_name text
)
returns public.conversations
language plpgsql
security invoker
set search_path = ''
as $$
declare
  thread public.conversations;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 71903));
  delete from public.voice_conversation_leases
    where user_id = p_user_id and expires_at <= pg_catalog.now();
  if exists (select from public.voice_conversation_leases where user_id = p_user_id) then
    raise exception 'Voice call already active' using errcode = '23505';
  end if;

  if p_resume then
    select * into strict thread from public.conversations
      where id = p_conversation_id and user_id = p_user_id
        and (uses_default_character or character_id is not null)
      for update;
  else
    insert into public.conversations (id, user_id, character_name, language, uses_default_character)
      values (p_conversation_id, p_user_id, 'Voice chat', 'en', true)
      returning * into thread;
  end if;

  insert into public.voice_conversation_leases (user_id, conversation_id, room_name, expires_at)
    values (p_user_id, p_conversation_id, p_room_name, pg_catalog.now() + interval '6 minutes');
  return thread;
end;
$$;

create function public.append_voice_call_message(
  p_user_id uuid, p_conversation_id uuid, p_room_name text,
  p_item_id text, p_role text, p_text text, p_interrupted boolean
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 71903));
  -- Lock the thread for position allocation and serialize replays of an item.
  perform 1 from public.conversations
    where id = p_conversation_id and user_id = p_user_id for update;
  if not found then
    raise exception 'Conversation unavailable' using errcode = 'P0002';
  end if;
  -- A stale worker cannot write after its call has been replaced.
  perform 1 from public.voice_conversation_leases
    where user_id = p_user_id and conversation_id = p_conversation_id
      and room_name = p_room_name and expires_at > pg_catalog.now()
    for share;
  if not found then
    raise exception 'Voice call is no longer active' using errcode = 'P0002';
  end if;

  insert into public.conversation_messages (
    conversation_id, id, position, role, source, parts, status, source_item_id
  ) values (
    p_conversation_id, p_room_name || ':' || p_item_id,
    (select coalesce(max(position), 0) + 1 from public.conversation_messages
      where conversation_id = p_conversation_id),
    p_role, 'voice',
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('type', 'text', 'content', p_text)),
    case when p_interrupted then 'interrupted' else 'completed' end, p_item_id
  )
  on conflict (conversation_id, id) do nothing;
end;
$$;

revoke all on function public.open_voice_call(uuid, uuid, boolean, text)
  from public, anon, authenticated;
grant execute on function public.open_voice_call(uuid, uuid, boolean, text) to service_role;
revoke all on function public.append_voice_call_message(uuid, uuid, text, text, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.append_voice_call_message(uuid, uuid, text, text, text, text, boolean)
  to service_role;
