-- Inactive empty user profile retention queries
--
-- Definitions:
-- - "Inactive for 6 months" uses auth.users.last_sign_in_at. If the user never
--   signed in, auth.users.created_at is used so new unvisited accounts are not
--   treated as stale immediately.
-- - "Audio calls" are stored in public.call_sessions in this schema.
-- - "Empty profile" means the user still has one untouched 10,000-credit
--   signup grant and has no generated audio files, call sessions, usage events,
--   custom voices, prompts, characters, or API keys.
-- - Legacy profiles with missing credit rows or duplicate signup grants are
--   intentionally excluded. Restoration can only reproduce one 10,000-credit
--   balance and one freemium transaction, so under-deletion is safer than
--   rewriting ambiguous account history.
--
-- Run the SELECT queries in the Supabase SQL editor first. The DELETE block at
-- the bottom is commented out by default because it permanently deletes rows.
-- Deleting public.profiles cascades to tables that have ON DELETE CASCADE FKs
-- such as public.credit_transactions and public.usage_events. public.credits is
-- deleted explicitly first because its FK does not cascade.
-- The dashboard restores these application rows if the retained Auth user returns.

-- ---------------------------------------------------------------------------
-- Preview: inactive empty user profiles eligible for deletion
-- ---------------------------------------------------------------------------
with credit_state as (
  select
    c.user_id,
    count(*) as credit_row_count,
    coalesce(sum(c.amount), 0) as credits_amount
  from public.credits c
  group by c.user_id
), transaction_state as (
  select
    ct.user_id,
    count(*) as credit_transaction_count,
    count(*) filter (
      where ct.type = 'freemium' and ct.amount = 10000
    ) as freemium_transaction_count
  from public.credit_transactions ct
  group by ct.user_id
), candidate_profiles as (
  select
    p.id,
    p.username,
    p.created_at as profile_created_at,
    p.updated_at as profile_updated_at,
    au.email,
    au.created_at as auth_created_at,
    au.last_sign_in_at,
    coalesce(au.last_sign_in_at, au.created_at) as last_seen_at,
    cs.credits_amount,
    cs.credit_row_count,
    ts.credit_transaction_count,
    ts.freemium_transaction_count
  from public.profiles p
  join auth.users au on au.id = p.id
  join credit_state cs on cs.user_id = p.id
  join transaction_state ts on ts.user_id = p.id
  where cs.credits_amount = 10000
    and cs.credit_row_count = 1
    and ts.credit_transaction_count = 1
    and ts.freemium_transaction_count = 1
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
select cp.*
from candidate_profiles cp
order by cp.last_seen_at asc;

-- ---------------------------------------------------------------------------
-- Summary: inactive empty user profiles eligible for deletion
-- ---------------------------------------------------------------------------
with credit_state as (
  select
    c.user_id,
    count(*) as credit_row_count,
    coalesce(sum(c.amount), 0) as credits_amount
  from public.credits c
  group by c.user_id
), transaction_state as (
  select
    ct.user_id,
    count(*) as credit_transaction_count,
    count(*) filter (
      where ct.type = 'freemium' and ct.amount = 10000
    ) as freemium_transaction_count
  from public.credit_transactions ct
  group by ct.user_id
), candidate_profiles as (
  select
    p.id,
    coalesce(au.last_sign_in_at, au.created_at) as last_seen_at
  from public.profiles p
  join auth.users au on au.id = p.id
  join credit_state cs on cs.user_id = p.id
  join transaction_state ts on ts.user_id = p.id
  where cs.credits_amount = 10000
    and cs.credit_row_count = 1
    and ts.credit_transaction_count = 1
    and ts.freemium_transaction_count = 1
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
-- with credit_state as (
--   select
--     c.user_id,
--     count(*) as credit_row_count,
--     coalesce(sum(c.amount), 0) as credits_amount
--   from public.credits c
--   group by c.user_id
-- ), transaction_state as (
--   select
--     ct.user_id,
--     count(*) as credit_transaction_count,
--     count(*) filter (
--       where ct.type = 'freemium' and ct.amount = 10000
--     ) as freemium_transaction_count
--   from public.credit_transactions ct
--   group by ct.user_id
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
-- join credit_state cs on cs.user_id = p.id
-- join transaction_state ts on ts.user_id = p.id
-- where cs.credits_amount = 10000
--   and cs.credit_row_count = 1
--   and ts.credit_transaction_count = 1
--   and ts.freemium_transaction_count = 1
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
