set search_path = '';

alter table public.conversations rename column is_voice_spike to uses_default_character;
comment on column public.conversations.uses_default_character is
  'Allows a thread using the default character to resume without a character ID. Threads with a deleted character stay read-only.';

alter table public.voice_spike_calls rename to voice_conversation_leases;
alter table public.voice_conversation_leases rename constraint voice_spike_calls_pkey
  to voice_conversation_leases_pkey;
alter table public.voice_conversation_leases rename constraint voice_spike_calls_conversation_id_user_id_fkey
  to voice_conversation_leases_conversation_id_user_id_fkey;
comment on table public.voice_conversation_leases is
  'One active LiveKit call or text reply per account. The room name identifies the holder, using chat:<run-id> for a text reply.';

alter table public.voice_spike_chat_runs rename to voice_chat_runs;
alter table public.voice_chat_runs rename constraint voice_spike_chat_runs_pkey to voice_chat_runs_pkey;
alter table public.voice_chat_runs rename constraint voice_spike_chat_runs_status_check to voice_chat_runs_status_check;
alter table public.voice_chat_runs rename constraint voice_spike_chat_runs_conversation_id_user_id_fkey
  to voice_chat_runs_conversation_id_user_id_fkey;
alter index public.voice_spike_chat_runs_thread_idx rename to voice_chat_runs_thread_idx;
comment on table public.voice_chat_runs is
  'Run state for resuming a streamed text reply, including the message position, status, usage, and expiry.';

-- Rename the RPCs in place to preserve grants, then update their stored bodies.
alter function public.open_voice_spike_call(uuid, uuid, boolean, text) rename to open_voice_call;
alter function public.append_voice_spike_message(uuid, uuid, text, text, text, text, boolean)
  rename to append_voice_call_message;
alter function public.start_voice_spike_chat(uuid, uuid, uuid, text) rename to start_voice_chat;
alter function public.save_voice_spike_chat(uuid, uuid, text, text, jsonb) rename to save_voice_chat_reply;
alter function public.read_voice_spike_chat(uuid, uuid) rename to read_voice_chat;

create or replace function public.open_voice_call(
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

create or replace function public.append_voice_call_message(
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

create or replace function public.start_voice_chat(
  p_user_id uuid, p_conversation_id uuid, p_run_id uuid, p_text text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  prior public.voice_chat_runs;
  user_position bigint;
  deadline timestamptz := pg_catalog.now() + interval '70 seconds';
begin
  if p_text is null or length(btrim(p_text)) not between 1 and 2000 then
    raise exception 'Invalid text' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 71903));
  select * into prior from public.voice_chat_runs where user_id = p_user_id and id = p_run_id;
  if found then
    if prior.conversation_id <> p_conversation_id or not exists (
      select from public.conversation_messages
        where conversation_id = p_conversation_id and id = 'chat-user:' || p_run_id
          and parts->0->>'content' = p_text
    ) then
      raise exception 'Run content changed' using errcode = '23505';
    end if;
    return false;
  end if;

  delete from public.voice_conversation_leases
    where user_id = p_user_id and expires_at <= pg_catalog.now();
  if exists (select from public.voice_conversation_leases where user_id = p_user_id) then
    raise exception 'Conversation already active' using errcode = '23505';
  end if;

  insert into public.conversations (id, user_id, character_name, language, uses_default_character)
    values (p_conversation_id, p_user_id, 'Voice chat', 'en', true)
    on conflict (id) do nothing;
  perform 1 from public.conversations
    where id = p_conversation_id and user_id = p_user_id
      and (uses_default_character or character_id is not null)
    for update;
  if not found then
    raise exception 'Conversation unavailable' using errcode = 'P0002';
  end if;

  select coalesce(max(position), 0) + 1 into user_position from public.conversation_messages
    where conversation_id = p_conversation_id;
  insert into public.conversation_messages (conversation_id, id, position, role, source, parts)
    values (p_conversation_id, 'chat-user:' || p_run_id, user_position, 'user', 'chat',
      pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('type', 'text', 'content', p_text)));
  insert into public.voice_conversation_leases (user_id, conversation_id, room_name, expires_at)
    values (p_user_id, p_conversation_id, 'chat:' || p_run_id, deadline);
  insert into public.voice_chat_runs (user_id, id, conversation_id, assistant_position, expires_at)
    values (p_user_id, p_run_id, p_conversation_id, user_position + 1, deadline);
  return true;
end;
$$;

create or replace function public.save_voice_chat_reply(
  p_user_id uuid, p_run_id uuid, p_text text, p_status text, p_usage jsonb
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  run public.voice_chat_runs;
begin
  if p_status is null or p_status not in ('streaming', 'completed', 'interrupted')
    or p_text is null or length(p_text) > 8000
    or (p_status = 'completed' and length(btrim(p_text)) = 0) then
    raise exception 'Invalid run result' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 71903));
  select * into run from public.voice_chat_runs
    where user_id = p_user_id and id = p_run_id and status = 'streaming'
      and expires_at > pg_catalog.now();
  if not found or not exists (
    select from public.voice_conversation_leases
      where user_id = p_user_id and conversation_id = run.conversation_id
        and room_name = 'chat:' || p_run_id and expires_at > pg_catalog.now()
  ) then
    return false;
  end if;

  -- A durable partial remains readable if the generator process exits.
  if length(p_text) > 0 then
    insert into public.conversation_messages (
      conversation_id, id, position, role, source, status, parts
    ) values (
      run.conversation_id, 'chat-assistant:' || p_run_id, run.assistant_position,
      'assistant', 'chat', case when p_status = 'completed' then 'completed' else 'interrupted' end,
      pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('type', 'text', 'content', p_text))
    )
    on conflict (conversation_id, id) do update set parts = excluded.parts, status = excluded.status;
  end if;

  if p_status <> 'streaming' then
    update public.voice_chat_runs set status = p_status, usage = p_usage
      where user_id = p_user_id and id = p_run_id;
    delete from public.voice_conversation_leases
      where user_id = p_user_id and room_name = 'chat:' || p_run_id;
  end if;
  return true;
end;
$$;

create or replace function public.read_voice_chat(p_user_id uuid, p_run_id uuid)
returns table (thread_id uuid, status text, reply text)
language sql
stable
security invoker
set search_path = ''
as $$
  select run.conversation_id,
    case when run.status = 'streaming' and run.expires_at <= pg_catalog.now()
      then 'interrupted' else run.status end,
    coalesce(message.parts->0->>'content', '')
  from public.voice_chat_runs as run
  left join public.conversation_messages as message
    on message.conversation_id = run.conversation_id and message.id = 'chat-assistant:' || run.id
  where run.user_id = p_user_id and run.id = p_run_id;
$$;
