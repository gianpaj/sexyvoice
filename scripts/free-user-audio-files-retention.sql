-- Free-user audio file retention queries
--
-- Definitions:
-- - A "free user" is a public.profiles row with no lifetime purchase/topup
--   transaction in public.credit_transactions.
-- - "Inactive for 6 months" uses auth.users.last_sign_in_at. If the user never
--   signed in, auth.users.created_at is used so new unvisited accounts are not
--   treated as stale immediately.
-- - Destructive database cleanup below is commented out by default. It hard
--   deletes matching usage_events rows first, then audio_files rows for DB table
--   cleanup.
--
-- Run the SELECT queries in the Supabase SQL editor to preview the rows before
-- running any DELETE statement. Cloudflare R2 object expiration is handled by
-- bucket lifecycle policy, not by an application script.

-- ---------------------------------------------------------------------------
-- Preview: free-user audio files older than 30 days
-- ---------------------------------------------------------------------------
with paid_users as (
  select distinct ct.user_id
  from public.credit_transactions ct
  where ct.type in ('purchase', 'topup')
), free_profiles as (
  select p.id, p.username, p.created_at as profile_created_at
  from public.profiles p
  left join paid_users pu on pu.user_id = p.id
  where pu.user_id is null
), target_audio_files as (
  select
    af.id,
    af.user_id,
    fp.username,
    af.storage_key,
    af.url,
    af.created_at,
    af.is_public,
    af.status,
    au.last_sign_in_at,
    au.created_at as auth_created_at
  from public.audio_files af
  join free_profiles fp on fp.id = af.user_id
  join auth.users au on au.id = af.user_id
  where af.status = 'active'
    and af.created_at < now() - interval '30 days'
)
select *
from target_audio_files
order by created_at asc;

-- ---------------------------------------------------------------------------
-- Preview: free-user audio files older than 30 days where the owner has not
-- logged in during the last 6 months
-- ---------------------------------------------------------------------------
with paid_users as (
  select distinct ct.user_id
  from public.credit_transactions ct
  where ct.type in ('purchase', 'topup')
), free_profiles as (
  select p.id, p.username, p.created_at as profile_created_at
  from public.profiles p
  left join paid_users pu on pu.user_id = p.id
  where pu.user_id is null
), target_audio_files as (
  select
    af.id,
    af.user_id,
    fp.username,
    af.storage_key,
    af.url,
    af.created_at,
    af.is_public,
    af.status,
    au.last_sign_in_at,
    au.created_at as auth_created_at
  from public.audio_files af
  join free_profiles fp on fp.id = af.user_id
  join auth.users au on au.id = af.user_id
  where af.status = 'active'
    and af.created_at < now() - interval '30 days'
    and coalesce(au.last_sign_in_at, au.created_at) < now() - interval '6 months'
)
select *
from target_audio_files
order by created_at asc;

-- ---------------------------------------------------------------------------
-- Summary counts for the 30-day retention policy
-- ---------------------------------------------------------------------------
with paid_users as (
  select distinct ct.user_id
  from public.credit_transactions ct
  where ct.type in ('purchase', 'topup')
), target_audio_files as (
  select af.*
  from public.audio_files af
  join public.profiles p on p.id = af.user_id
  left join paid_users pu on pu.user_id = p.id
  where pu.user_id is null
    and af.status = 'active'
    and af.created_at < now() - interval '30 days'
)
select
  count(*) as audio_file_count,
  count(distinct user_id) as user_count,
  min(created_at) as oldest_audio_file,
  max(created_at) as newest_audio_file,
  count(*) filter (where is_public) as public_audio_file_count,
  count(*) filter (where not is_public) as private_audio_file_count
from target_audio_files;

-- ---------------------------------------------------------------------------
-- Preview: matching TTS usage events for the inactive free-user audio files
-- above. These can be deleted before deleting public.audio_files to reduce DB
-- space while keeping user/account-level records.
-- ---------------------------------------------------------------------------
with paid_users as (
  select distinct ct.user_id
  from public.credit_transactions ct
  where ct.type in ('purchase', 'topup')
), free_profiles as (
  select p.id, p.username, p.created_at as profile_created_at
  from public.profiles p
  left join paid_users pu on pu.user_id = p.id
  where pu.user_id is null
), target_audio_files as (
  select
    af.id,
    af.user_id,
    fp.username,
    af.storage_key,
    af.url,
    af.created_at,
    af.is_public,
    af.status,
    au.last_sign_in_at,
    au.created_at as auth_created_at
  from public.audio_files af
  join free_profiles fp on fp.id = af.user_id
  join auth.users au on au.id = af.user_id
  where af.status = 'active'
    and af.created_at < now() - interval '30 days'
    and coalesce(au.last_sign_in_at, au.created_at) < now() - interval '6 months'
), target_usage_events as (
  select
    ue.id,
    ue.user_id,
    ue.source_type,
    ue.source_id,
    ue.credits_used,
    ue.occurred_at,
    ue.created_at
  from public.usage_events ue
  join target_audio_files target on target.id = ue.source_id
  where ue.source_type = 'tts'
)
select
  count(*) as usage_event_count,
  count(distinct user_id) as user_count,
  coalesce(sum(credits_used), 0) as credits_used_total,
  min(occurred_at) as oldest_usage_event,
  max(occurred_at) as newest_usage_event
from target_usage_events;

-- ---------------------------------------------------------------------------
-- Optional DB-only hard delete for inactive free-user audio files and matching
-- TTS usage events.
--
-- WARNING: This permanently deletes matching public.usage_events and
-- public.audio_files rows. Run the preview queries above first, then uncomment
-- and run this block only when you are ready to clean the database table.
--
-- public.usage_events is append-only by design, so this maintenance block
-- temporarily disables only the delete-prevention trigger and re-enables it
-- before the transaction ends. Keep `rollback;` while testing; replace it with
-- `commit;` only when the returned rows look correct.
--
-- Cloudflare R2 object expiration is handled by bucket lifecycle policy; this
-- does not delete R2 objects.
-- ---------------------------------------------------------------------------
-- begin;
--
-- alter table public.usage_events disable trigger usage_events_prevent_delete;
--
-- create temporary table target_free_user_audio_files on commit drop as
-- with paid_users as (
--   select distinct ct.user_id
--   from public.credit_transactions ct
--   where ct.type in ('purchase', 'topup')
-- ), free_profiles as (
--   select p.id, p.username, p.created_at as profile_created_at
--   from public.profiles p
--   left join paid_users pu on pu.user_id = p.id
--   where pu.user_id is null
-- )
-- select
--   af.id,
--   af.user_id,
--   fp.username,
--   af.storage_key,
--   af.url,
--   af.created_at,
--   af.is_public,
--   af.status,
--   au.last_sign_in_at,
--   au.created_at as auth_created_at
-- from public.audio_files af
-- join free_profiles fp on fp.id = af.user_id
-- join auth.users au on au.id = af.user_id
-- where af.status = 'active'
--   and af.created_at < now() - interval '30 days'
--   and coalesce(au.last_sign_in_at, au.created_at) < now() - interval '6 months';
--
-- select count(*) as audio_files_to_delete
-- from target_free_user_audio_files;
--
-- delete from public.usage_events ue
-- using target_free_user_audio_files target
-- where ue.source_type = 'tts'
--   and ue.source_id = target.id
-- returning
--   ue.id,
--   ue.user_id,
--   ue.source_type,
--   ue.source_id,
--   ue.credits_used,
--   ue.occurred_at,
--   ue.created_at;
--
-- alter table public.usage_events enable trigger usage_events_prevent_delete;
--
-- delete from public.audio_files af
-- using target_free_user_audio_files target
-- where af.id = target.id
-- returning
--   af.id,
--   af.user_id,
--   target.username,
--   af.storage_key,
--   af.url,
--   af.created_at,
--   af.is_public,
--   af.status,
--   target.last_sign_in_at,
--   target.auth_created_at;
--
-- rollback;
-- -- commit;
