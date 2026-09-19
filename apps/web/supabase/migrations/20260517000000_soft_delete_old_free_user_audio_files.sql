set search_path = '';

-- Scheduled soft-delete retention cleanup for free-account generated audio.
--
-- Product policy: generated audio objects are expired separately by Cloudflare
-- R2 bucket lifecycle policy. This scheduled database cleanup marks old
-- public.audio_files rows for free accounts as deleted after 30 days.
--
-- A free account is defined as a profile with no lifetime purchase/topup credit
-- transaction. This is a soft delete because a separate scheduled cleanup
-- permanently deletes old rows after a longer retention window.
--
-- This migration only schedules recurring database retention cleanup via pg_cron;
-- it does not delete R2 objects.

create extension if not exists pg_cron with schema pg_catalog;

grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

-- Keep the migration idempotent if it is replayed in a branch/preview database.
select cron.unschedule(jobid)
from cron.job
where jobname = 'soft-delete-old-free-user-audio-files';

select cron.schedule(
  'soft-delete-old-free-user-audio-files',
  '17 3 * * *', -- Daily at 03:17 UTC.
  $cron$
    with paid_users as (
      select distinct ct.user_id
      from public.credit_transactions ct
      where ct.type in ('purchase', 'topup')
    ), target_audio_files as (
      select af.id
      from public.audio_files af
      join public.profiles p on p.id = af.user_id
      left join paid_users pu on pu.user_id = p.id
      where pu.user_id is null
        and af.status = 'active'
        and af.created_at < now() - interval '30 days'
    )
    update public.audio_files af
    set
      status = 'deleted',
      deleted_at = now()
    from target_audio_files target
    where af.id = target.id;
  $cron$
);
