-- Inactive empty user profile retention queries
--
-- Definitions:
-- - "Inactive for 6 months" uses auth.users.last_sign_in_at. If the user never
--   signed in, auth.users.created_at is used so new unvisited accounts are not
--   treated as stale immediately.
-- - "Audio calls" are stored in public.call_sessions in this schema.
-- - "Empty profile" means the user has no generated audio files, call sessions,
--   usage events, custom voices, prompts, characters, API keys, or paid
--   purchase/topup credit transactions.
--
-- Run the SELECT queries in the Supabase SQL editor first. The DELETE block at
-- the bottom is commented out by default because it permanently deletes rows.
-- Deleting public.profiles cascades to tables that have ON DELETE CASCADE FKs
-- such as public.credit_transactions and public.usage_events. public.credits is
-- deleted explicitly first because its FK does not cascade.

-- ---------------------------------------------------------------------------
-- Preview: inactive empty user profiles eligible for deletion
-- ---------------------------------------------------------------------------
with paid_users as (
  select distinct ct.user_id
  from public.credit_transactions ct
  where ct.type in ('purchase', 'topup')
), candidate_profiles as (
  select
    p.id,
    p.username,
    p.created_at as profile_created_at,
    p.updated_at as profile_updated_at,
    au.email,
    au.created_at as auth_created_at,
    au.last_sign_in_at,
    coalesce(au.last_sign_in_at, au.created_at) as last_seen_at
  from public.profiles p
  join auth.users au on au.id = p.id
  left join paid_users pu on pu.user_id = p.id
  where pu.user_id is null
    and coalesce(au.last_sign_in_at, au.created_at) < now() - interval '6 months'
    and not exists (
      select 1
      from public.audio_files af
      where af.user_id = p.id
    )
    and not exists (
      select 1
      from public.call_sessions cs
      where cs.user_id = p.id
    )
    and not exists (
      select 1
      from public.usage_events ue
      where ue.user_id = p.id
    )
    and not exists (
      select 1
      from public.voices v
      where v.user_id = p.id
    )
    and not exists (
      select 1
      from public.prompts pr
      where pr.user_id = p.id
    )
    and not exists (
      select 1
      from public.characters ch
      where ch.user_id = p.id
    )
    and not exists (
      select 1
      from public.api_keys ak
      where ak.user_id = p.id
    )
)
select
  cp.*,
  (
    select coalesce(sum(c.amount), 0)
    from public.credits c
    where c.user_id = cp.id
  ) as credits_amount,
  (
    select count(*)
    from public.credit_transactions ct
    where ct.user_id = cp.id
  ) as credit_transaction_count
from candidate_profiles cp
order by cp.last_seen_at asc;

-- ---------------------------------------------------------------------------
-- Summary: inactive empty user profiles eligible for deletion
-- ---------------------------------------------------------------------------
with paid_users as (
  select distinct ct.user_id
  from public.credit_transactions ct
  where ct.type in ('purchase', 'topup')
), candidate_profiles as (
  select
    p.id,
    coalesce(au.last_sign_in_at, au.created_at) as last_seen_at
  from public.profiles p
  join auth.users au on au.id = p.id
  left join paid_users pu on pu.user_id = p.id
  where pu.user_id is null
    and coalesce(au.last_sign_in_at, au.created_at) < now() - interval '6 months'
    and not exists (
      select 1
      from public.audio_files af
      where af.user_id = p.id
    )
    and not exists (
      select 1
      from public.call_sessions cs
      where cs.user_id = p.id
    )
    and not exists (
      select 1
      from public.usage_events ue
      where ue.user_id = p.id
    )
    and not exists (
      select 1
      from public.voices v
      where v.user_id = p.id
    )
    and not exists (
      select 1
      from public.prompts pr
      where pr.user_id = p.id
    )
    and not exists (
      select 1
      from public.characters ch
      where ch.user_id = p.id
    )
    and not exists (
      select 1
      from public.api_keys ak
      where ak.user_id = p.id
    )
)
select
  count(*) as profile_count,
  min(last_seen_at) as oldest_last_seen_at,
  max(last_seen_at) as newest_last_seen_at
from candidate_profiles;

-- ---------------------------------------------------------------------------
-- Optional DB-only hard delete for inactive empty user profiles.
--
-- WARNING: This permanently deletes matching public.profiles rows and explicitly
-- deletes their public.credits rows first. Run the preview and summary queries
-- above before uncommenting this block. Keep `rollback;` while testing; replace
-- it with `commit;` only when you are ready to clean the database table.
--
-- This does not delete auth.users rows. It deletes public.profiles rows only.
-- ---------------------------------------------------------------------------
-- begin;
--
-- create temporary table target_inactive_empty_profiles on commit drop as
-- with paid_users as (
--   select distinct ct.user_id
--   from public.credit_transactions ct
--   where ct.type in ('purchase', 'topup')
-- )
-- select
--   p.id,
--   p.username,
--   au.email,
--   au.created_at as auth_created_at,
--   au.last_sign_in_at,
--   coalesce(au.last_sign_in_at, au.created_at) as last_seen_at
-- from public.profiles p
-- join auth.users au on au.id = p.id
-- left join paid_users pu on pu.user_id = p.id
-- where pu.user_id is null
--   and coalesce(au.last_sign_in_at, au.created_at) < now() - interval '6 months'
--   and not exists (
--     select 1
--     from public.audio_files af
--     where af.user_id = p.id
--   )
--   and not exists (
--     select 1
--     from public.call_sessions cs
--     where cs.user_id = p.id
--   )
--   and not exists (
--     select 1
--     from public.usage_events ue
--     where ue.user_id = p.id
--   )
--   and not exists (
--     select 1
--     from public.voices v
--     where v.user_id = p.id
--   )
--   and not exists (
--     select 1
--     from public.prompts pr
--     where pr.user_id = p.id
--   )
--   and not exists (
--     select 1
--     from public.characters ch
--     where ch.user_id = p.id
--   )
--   and not exists (
--     select 1
--     from public.api_keys ak
--     where ak.user_id = p.id
--   );
--
-- select count(*) as profiles_to_delete
-- from target_inactive_empty_profiles;
--
-- delete from public.credits c
-- using target_inactive_empty_profiles target
-- where c.user_id = target.id
-- returning c.id, c.user_id, c.amount, target.username, target.email;
--
-- delete from public.profiles p
-- using target_inactive_empty_profiles target
-- where p.id = target.id
-- returning
--   p.id,
--   p.username,
--   target.email,
--   p.created_at as profile_created_at,
--   target.auth_created_at,
--   target.last_sign_in_at,
--   target.last_seen_at;
--
-- rollback;
-- -- commit;
