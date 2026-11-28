-- Chat receipts share the existing per-user demo lease with calls.
set search_path = '';

create table public.voice_chat_runs (
  user_id uuid not null,
  id uuid not null,
  conversation_id uuid not null,
  assistant_position bigint not null,
  expires_at timestamptz not null,
  status text not null default 'streaming'
    check (status in ('streaming', 'completed', 'interrupted')),
  usage jsonb,
  primary key (user_id, id),
  foreign key (conversation_id, user_id) references public.conversations (id, user_id)
    on delete cascade
);
create index voice_chat_runs_thread_idx
  on public.voice_chat_runs (conversation_id, user_id, expires_at desc)
  where status = 'streaming';
alter table public.voice_chat_runs enable row level security;
revoke all on public.voice_chat_runs from public, anon, authenticated;
grant select, insert, update, delete on public.voice_chat_runs to service_role;

comment on table public.voice_chat_runs is
  'Run state for resuming a streamed text reply, including the message position, status, usage, and expiry.';

create function public.start_voice_chat(
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

create function public.save_voice_chat_reply(
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

create function public.read_voice_chat(p_user_id uuid, p_run_id uuid)
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

revoke all on function public.start_voice_chat(uuid, uuid, uuid, text),
  public.save_voice_chat_reply(uuid, uuid, text, text, jsonb),
  public.read_voice_chat(uuid, uuid) from public, anon, authenticated;
grant execute on function public.start_voice_chat(uuid, uuid, uuid, text),
  public.save_voice_chat_reply(uuid, uuid, text, text, jsonb),
  public.read_voice_chat(uuid, uuid) to service_role;
