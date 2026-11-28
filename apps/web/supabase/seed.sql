-- characters.voice_id and audio_files.voice_id reference this shared row.
-- The actual clone is stored in audio_references.
insert into auth.users (id, email, banned_until)
select
  '00000000-0000-4000-a000-000000000001'::uuid,
  'voice-catalog@local.invalid',
  'infinity'::timestamptz
where not exists (
  select 1 from public.voices
  where id = '420c4014-7d6d-44ef-b87d-962a3124a170'
)
on conflict (id) do nothing;

insert into public.voices (id, user_id, name, language, model, feature, is_public)
values (
  '420c4014-7d6d-44ef-b87d-962a3124a170',
  '00000000-0000-4000-a000-000000000001',
  'Cloned Voice',
  'en',
  'inworld-tts-2',
  'tts',
  false
)
on conflict (id) do nothing;
