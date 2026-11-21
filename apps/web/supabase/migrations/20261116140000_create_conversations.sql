-- Shared chat/voice history. Runtime admission, billing, memory work, and stream
-- logs are separate migrations; existing calls keep a NULL conversation_id.
set search_path = '';

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  character_id uuid references public.characters(id) on delete set null,
  character_name text not null check (length(btrim(character_name)) > 0),
  scene_id text check (scene_id is null or length(btrim(scene_id)) > 0),
  scene_instructions text not null default '',
  language text not null check (length(btrim(language)) > 0),
  revision bigint not null default 0 check (revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conversations_id_user_id_key unique (id, user_id)
);

comment on table public.conversations is
  'One owned thread with a character and scene; id maps to TanStack threadId.';
comment on column public.conversations.character_name is
  'Display-name snapshot retained when the character is deleted. A NULL character_id makes the thread read-only in the application.';
comment on column public.conversations.scene_instructions is
  'User-selected scene snapshot. Never store character system prompts, memory context, or provider secrets here.';
comment on column public.conversations.revision is
  'Advances on each message mutation. Writers lock this thread and verify their expected revision before reconciling history.';

create index conversations_user_character_updated_idx
  on public.conversations (user_id, character_id, updated_at desc, id);
create index conversations_character_id_idx
  on public.conversations (character_id) where character_id is not null;

alter table public.call_sessions add column conversation_id uuid;
alter table public.call_sessions
  add constraint call_sessions_conversation_owner_fkey
  foreign key (conversation_id, user_id)
  references public.conversations (id, user_id)
  on delete set null (conversation_id);
alter table public.call_sessions
  add constraint call_sessions_id_conversation_id_key unique (id, conversation_id);
create index call_sessions_conversation_id_idx
  on public.call_sessions (conversation_id) where conversation_id is not null;

-- Visible V1 history contains text only. Keep provider/tool state and reasoning
-- outside these owner-readable rows; extend the validator with future media.
create function public.conversation_text_parts_valid(parts jsonb)
returns boolean
language sql
immutable
strict
security invoker
set search_path = ''
as $$
  select case when pg_catalog.jsonb_typeof(parts) = 'array' then
    not exists (
      select 1 from pg_catalog.jsonb_array_elements(parts) as items(part)
      where (case when pg_catalog.jsonb_typeof(part) = 'object' then
        part->>'type' = 'text'
        and pg_catalog.jsonb_typeof(part->'content') = 'string'
        and part - 'type' - 'content' = '{}'::jsonb
      else false end) is not true
    )
  else false end;
$$;

create table public.conversation_messages (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  id text not null check (length(btrim(id)) between 1 and 200),
  position bigint not null check (position > 0),
  role text not null check (role in ('user', 'assistant')),
  source text not null check (source in ('chat', 'voice')),
  parts jsonb not null default '[]'::jsonb
    check (public.conversation_text_parts_valid(parts)),
  status text not null default 'completed'
    check (status in ('pending', 'streaming', 'completed', 'interrupted', 'failed')),
  revision bigint not null default 1 check (revision > 0),
  call_session_id uuid,
  source_item_id text check (source_item_id is null or length(btrim(source_item_id)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (conversation_id, id),
  constraint conversation_messages_position_key unique (conversation_id, position)
    deferrable initially immediate,
  -- Deferred so deleting a thread can both cascade its messages and unlink
  -- its calls without an intermediate reference blocking either action.
  constraint conversation_messages_call_fkey
    foreign key (call_session_id, conversation_id)
    references public.call_sessions (id, conversation_id)
    on delete set null (call_session_id)
    deferrable initially deferred,
  constraint conversation_messages_source_reference_check check (
    (source = 'chat' and call_session_id is null and source_item_id is null)
    or (source = 'voice' and source_item_id is not null)
  ),
  constraint conversation_messages_call_item_key unique (call_session_id, source_item_id)
);

comment on column public.conversation_messages.id is
  'Stable message ID scoped to thread; maps to TanStack UIMessage.id. Corrections update this row.';
comment on column public.conversation_messages.position is
  'Server-assigned thread order, independent of callback arrival time. Writers lock the thread; a transaction may defer uniqueness while correcting call order.';
comment on column public.conversation_messages.parts is
  'TanStack visible text parts: [{"type":"text","content":"..."}]. Empty while awaiting visible text. Thinking is transient UI state.';
comment on column public.conversation_messages.source_item_id is
  'Original committed LiveKit item ID; unique within its call. Seeded history is not appended as new call dialogue.';
comment on column public.conversation_messages.call_session_id is
  'Nullable after source-call deletion; the conversation text and source item ID remain.';

create function public.touch_conversation_message()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.conversation_id is distinct from old.conversation_id then
    raise exception 'Message identity is immutable' using errcode = '23514';
  end if;
  new.revision := old.revision + 1;
  new.created_at := old.created_at;
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

create function public.advance_conversation_revision()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    update public.conversations set revision = revision + 1
    where id = old.conversation_id;
    return old;
  end if;
  update public.conversations set revision = revision + 1
  where id = new.conversation_id;
  return new;
end;
$$;

-- Existing call_sessions clients can INSERT/UPDATE their legacy rows. Those
-- grants must not let a browser claim, detach, or replace a server-owned link.
create function public.guard_call_conversation_link()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      if new.conversation_id is not null then
        raise exception 'Only the server can link a call to a conversation' using errcode = '42501';
      end if;
    elsif new.conversation_id is distinct from old.conversation_id then
      raise exception 'Only the server can link a call to a conversation' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger update_conversations_updated_at
  before update on public.conversations
  for each row execute function public.update_updated_at_column();
create trigger touch_conversation_message
  before update on public.conversation_messages
  for each row execute function public.touch_conversation_message();
create trigger advance_conversation_revision
  after insert or update or delete on public.conversation_messages
  for each row execute function public.advance_conversation_revision();
create trigger guard_call_conversation_link
  before insert or update of conversation_id on public.call_sessions
  for each row execute function public.guard_call_conversation_link();

alter table public.conversations enable row level security;
alter table public.conversation_messages enable row level security;

revoke all on public.conversations, public.conversation_messages from public, anon, authenticated;
grant select on public.conversations, public.conversation_messages to authenticated;
grant all on public.conversations, public.conversation_messages to service_role;

create policy conversations_owner_read on public.conversations
  for select to authenticated using ((select auth.uid()) = user_id);
create policy conversation_messages_owner_read on public.conversation_messages
  for select to authenticated using (exists (
    select 1 from public.conversations as conversation
    where conversation.id = conversation_id and conversation.user_id = (select auth.uid())
  ));

revoke all on function public.conversation_text_parts_valid(jsonb) from public, anon, authenticated;
revoke all on function public.touch_conversation_message() from public, anon, authenticated;
revoke all on function public.advance_conversation_revision() from public, anon, authenticated;
revoke all on function public.guard_call_conversation_link() from public, anon, authenticated;
grant execute on function public.conversation_text_parts_valid(jsonb) to service_role;
grant execute on function public.touch_conversation_message() to service_role;
grant execute on function public.advance_conversation_revision() to service_role;
grant execute on function public.guard_call_conversation_link() to service_role;
