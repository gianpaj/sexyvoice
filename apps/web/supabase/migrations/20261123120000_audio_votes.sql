-- Per-user thumbs up/down votes on generated audio files.
--
-- Vote state lives in Postgres instead of Redis so the stored vote and the
-- audio_files.total_votes counter change in one transaction: overlapping
-- votes cannot double-count, and deleting or replacing an audio row cannot
-- leave a stale vote behind (votes reference the row's id, not its reusable
-- public URL).

create table if not exists public.audio_votes (
  audio_file_id uuid not null references public.audio_files(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  vote text not null check (vote in ('up', 'down')),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  primary key (audio_file_id, user_id)
);

-- RLS enabled with no policies: all access goes through the admin/service-role client.
alter table public.audio_votes enable row level security;

-- The vote route resolves the caller's active audio row by public URL. Rows
-- can share a URL (cache hits insert a fresh row each generation), so the
-- index stays non-unique.
create index if not exists audio_files_url_active_idx
  on public.audio_files (url)
  where status = 'active';

-- Apply a vote delta to audio_files.total_votes and record the caller's vote
-- in one transaction. Returns the new total, or NULL when the caller owns no
-- active audio row for the URL.
create or replace function public.record_audio_vote(
  p_user_id uuid,
  p_audio_url text,
  p_vote text default null
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_audio_id uuid;
  v_total integer;
  v_previous text;
  v_delta integer;
begin
  if p_vote is not null and p_vote not in ('up', 'down') then
    raise exception 'Invalid vote value'
      using errcode = '22023';
  end if;

  -- Lock the newest active row owned by the caller. Locking serializes
  -- overlapping votes on the same audio so each request sees the vote state
  -- the previous one committed.
  select id
  into v_audio_id
  from public.audio_files
  where url = p_audio_url
    and status = 'active'
    and user_id = p_user_id
  order by created_at desc
  limit 1
  for update;

  if not found then
    return null;
  end if;

  select vote
  into v_previous
  from public.audio_votes
  where audio_file_id = v_audio_id
    and user_id = p_user_id;

  v_delta :=
    case p_vote when 'up' then 1 when 'down' then -1 else 0 end -
    case v_previous when 'up' then 1 when 'down' then -1 else 0 end;

  if v_delta = 0 then
    select total_votes
    into v_total
    from public.audio_files
    where id = v_audio_id;
    return v_total;
  end if;

  update public.audio_files
  set total_votes = total_votes + v_delta
  where id = v_audio_id
  returning total_votes into v_total;

  if p_vote is null then
    delete from public.audio_votes
    where audio_file_id = v_audio_id
      and user_id = p_user_id;
  else
    insert into public.audio_votes (audio_file_id, user_id, vote, updated_at)
    values (v_audio_id, p_user_id, p_vote, timezone('utc'::text, now()))
    on conflict (audio_file_id, user_id)
    do update set
      vote = excluded.vote,
      updated_at = excluded.updated_at;
  end if;

  return v_total;
end;
$$;

-- Read the caller's stored vote for their newest active audio row at a URL.
-- Returns 'up', 'down', or NULL when the row is missing or unrated.
create or replace function public.get_audio_vote(
  p_user_id uuid,
  p_audio_url text
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_audio_id uuid;
  v_vote text;
begin
  select id
  into v_audio_id
  from public.audio_files
  where url = p_audio_url
    and status = 'active'
    and user_id = p_user_id
  order by created_at desc
  limit 1;

  if not found then
    return null;
  end if;

  select vote
  into v_vote
  from public.audio_votes
  where audio_file_id = v_audio_id
    and user_id = p_user_id;

  return v_vote;
end;
$$;

-- Only server-side service-role code may call the vote functions.
revoke all on function public.record_audio_vote(uuid, text, text) from public;
revoke all on function public.get_audio_vote(uuid, text) from public;
grant execute on function public.record_audio_vote(uuid, text, text) to service_role;
grant execute on function public.get_audio_vote(uuid, text) to service_role;
