-- Store a private rating against a finished call or a generated audio file.
set search_path = '';

create table public.feedback (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  call_session_id uuid references public.call_sessions (id) on delete cascade,
  audio_file_id uuid references public.audio_files (id) on delete cascade,
  rating text not null check (rating in ('up', 'down')),
  reason_code text check (pg_catalog.char_length(reason_code) between 1 and 64),
  note text check (pg_catalog.char_length(note) between 1 and 1000),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint feedback_one_target check (pg_catalog.num_nonnulls(call_session_id, audio_file_id) = 1),
  constraint feedback_reason_requires_down check (rating = 'down' or (reason_code is null and note is null)),
  constraint feedback_one_rating_per_target unique nulls not distinct (user_id, call_session_id, audio_file_id)
);

create index feedback_call_session_id_idx on public.feedback (call_session_id) where call_session_id is not null;
create index feedback_audio_file_id_idx on public.feedback (audio_file_id) where audio_file_id is not null;

alter table public.feedback enable row level security;
revoke all on public.feedback from public, anon, authenticated;
grant select on public.feedback to authenticated;
grant select, insert, update, delete on public.feedback to service_role;

create policy feedback_owner_select on public.feedback
for select to authenticated
using (user_id = (select auth.uid()));

-- Resolve the target and write the rating in one transaction. The account
-- erasure lock prevents a submission from racing with account cleanup.
create function public.save_feedback(
  p_user_id uuid,
  p_rating text,
  p_call_room_name text default null,
  p_audio_file_id uuid default null,
  p_reason_code text default null,
  p_note text default null
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  call_id uuid;
  audio_id uuid;
  call_status text;
  saved_rating text;
begin
  if pg_catalog.num_nonnulls(p_call_room_name, p_audio_file_id) <> 1 then
    raise exception 'Choose one feedback target' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 71903));
  if exists (
    select from public.account_conversation_erasures
    where user_id = p_user_id and blocked_until > pg_catalog.clock_timestamp()
  ) then
    raise exception 'Feedback target unavailable' using errcode = 'P0002';
  end if;

  if p_call_room_name is not null then
    select id, status into call_id, call_status
    from public.call_sessions
    where user_id = p_user_id and livekit_room_name = p_call_room_name and conversation_id is not null
    for share;
    if not found then
      raise exception 'Feedback target unavailable' using errcode = 'P0002';
    end if;
    if call_status = 'active' then
      raise exception 'Call is still ending' using errcode = '55000';
    end if;
  else
    select id into audio_id
    from public.audio_files
    where id = p_audio_file_id and user_id = p_user_id and status = 'active'
    for share;
    if not found then
      raise exception 'Feedback target unavailable' using errcode = 'P0002';
    end if;
  end if;

  insert into public.feedback (user_id, call_session_id, audio_file_id, rating, reason_code, note)
  values (p_user_id, call_id, audio_id, p_rating, p_reason_code, p_note)
  on conflict on constraint feedback_one_rating_per_target do update
    set rating = excluded.rating, reason_code = excluded.reason_code,
        note = excluded.note, updated_at = pg_catalog.now()
  returning rating into saved_rating;

  return saved_rating;
end;
$$;

revoke all on function public.save_feedback(uuid, text, text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.save_feedback(uuid, text, text, uuid, text, text) to service_role;
