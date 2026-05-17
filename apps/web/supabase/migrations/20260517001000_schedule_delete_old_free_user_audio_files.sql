set search_path = '';

-- Scheduled hard-delete retention cleanup for free-account generated audio
-- metadata.
--
-- Product policy: generated audio objects are expired separately by Cloudflare
-- R2 bucket lifecycle policy. This scheduled database cleanup permanently
-- deletes old public.audio_files rows for free accounts after 45 days.
--
-- A free account is defined as a profile with no lifetime purchase/topup credit
-- transaction.
--
-- This migration only schedules recurring database retention cleanup via pg_cron;
-- it does not delete R2 objects.

-- pg_cron is enabled and granted in 20260517000000_soft_delete_old_free_user_audio_files.sql.

-- Keep the migration idempotent if it is replayed in a branch/preview database.
select cron.unschedule(jobid)
from cron.job
where jobname = 'delete-old-free-user-audio-files';

select cron.schedule(
  'delete-old-free-user-audio-files',
  '47 3 * * *', -- Daily at 03:47 UTC, after the soft-delete job.
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
        and af.created_at < now() - interval '45 days'
    )
    delete from public.audio_files af
    using target_audio_files target
    where af.id = target.id;
  $cron$
);
