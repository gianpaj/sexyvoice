-- pgTAP coverage for the audio vote table and RPCs.
--
-- Run against the migrated local Supabase database with:
--
--   pnpm test:db

begin;

select plan(26);

-- ─── Structure and privileges ────────────────────────────────────────────────

select ok(
  (
    select relation.relrowsecurity
    from pg_catalog.pg_class relation
    where relation.oid = 'public.audio_votes'::pg_catalog.regclass
  ),
  'audio_votes has RLS enabled'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'audio_votes'
  ),
  0,
  'audio_votes has no policies; only the service role reaches it'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_indexes
    where schemaname = 'public'
      and tablename = 'audio_files'
      and indexname = 'audio_files_url_active_idx'
  ),
  'audio_files has an index for the active-row URL lookup'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.record_audio_vote(uuid,text,text)',
    'EXECUTE'
  ),
  'service_role can execute record_audio_vote'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.record_audio_vote(uuid,text,text)',
    'EXECUTE'
  ),
  'authenticated cannot execute record_audio_vote'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.record_audio_vote(uuid,text,text)',
    'EXECUTE'
  ),
  'anon cannot execute record_audio_vote'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.get_audio_vote(uuid,text)',
    'EXECUTE'
  ),
  'service_role can execute get_audio_vote'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.get_audio_vote(uuid,text)',
    'EXECUTE'
  ),
  'authenticated cannot execute get_audio_vote'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.get_audio_vote(uuid,text)',
    'EXECUTE'
  ),
  'anon cannot execute get_audio_vote'
);

-- ─── Fixtures ────────────────────────────────────────────────────────────────

-- Defer the auth.users reference so the fixture profiles do not need real
-- auth rows; the test rolls back before the constraint is checked.
alter table public.profiles
  alter constraint profiles_id_fkey
  deferrable initially deferred;

insert into public.profiles (id, username)
values
  ('aaaaaaaa-0000-4000-8000-aaaaaaaaaaaa', 'pgtap-audio-vote-owner'),
  ('bbbbbbbb-0000-4000-8000-bbbbbbbbbbbb', 'pgtap-audio-vote-other');

insert into public.voices (id, user_id, name, language, model)
values (
  'cccccccc-0000-4000-8000-cccccccccccc',
  'aaaaaaaa-0000-4000-8000-aaaaaaaaaaaa',
  'pgtap voice',
  'en',
  'gpro'
);

insert into public.audio_files (
  id, voice_id, user_id, storage_key, duration, text_content, url, model
) values (
  'dddddddd-0000-4000-8000-dddddddddddd',
  'cccccccc-0000-4000-8000-cccccccccccc',
  'aaaaaaaa-0000-4000-8000-aaaaaaaaaaaa',
  'pgtap/vote-target.wav',
  1.5,
  'pgtap vote target',
  'https://example.com/pgtap-vote.wav',
  'gpro'
);

-- ─── Behaviour as service_role ───────────────────────────────────────────────

set local role service_role;

select is(
  public.record_audio_vote(
    'aaaaaaaa-0000-4000-8000-aaaaaaaaaaaa',
    'https://example.com/pgtap-vote.wav',
    'up'
  ),
  1,
  'an upvote increments total_votes to 1'
);

select is(
  (
    select total_votes
    from public.audio_files
    where id = 'dddddddd-0000-4000-8000-dddddddddddd'
  ),
  1,
  'total_votes reflects the upvote'
);

select is(
  public.get_audio_vote(
    'aaaaaaaa-0000-4000-8000-aaaaaaaaaaaa',
    'https://example.com/pgtap-vote.wav'
  ),
  'up',
  'get_audio_vote returns the stored upvote'
);

select is(
  public.record_audio_vote(
    'aaaaaaaa-0000-4000-8000-aaaaaaaaaaaa',
    'https://example.com/pgtap-vote.wav',
    'up'
  ),
  1,
  'repeating the same vote is a no-op'
);

select is(
  (
    select count(*)::integer
    from public.audio_votes
    where audio_file_id = 'dddddddd-0000-4000-8000-dddddddddddd'
  ),
  1,
  'one stored vote per user per audio row'
);

select is(
  public.record_audio_vote(
    'aaaaaaaa-0000-4000-8000-aaaaaaaaaaaa',
    'https://example.com/pgtap-vote.wav',
    'down'
  ),
  -1,
  'switching votes applies the two-point swing'
);

select is(
  public.get_audio_vote(
    'aaaaaaaa-0000-4000-8000-aaaaaaaaaaaa',
    'https://example.com/pgtap-vote.wav'
  ),
  'down',
  'get_audio_vote returns the switched vote'
);

select is(
  public.record_audio_vote(
    'aaaaaaaa-0000-4000-8000-aaaaaaaaaaaa',
    'https://example.com/pgtap-vote.wav',
    null
  ),
  0,
  'clearing the vote removes its delta'
);

select is(
  (
    select count(*)::integer
    from public.audio_votes
    where audio_file_id = 'dddddddd-0000-4000-8000-dddddddddddd'
  ),
  0,
  'clearing deletes the stored vote row'
);

select ok(
  public.get_audio_vote(
    'aaaaaaaa-0000-4000-8000-aaaaaaaaaaaa',
    'https://example.com/pgtap-vote.wav'
  ) is null,
  'cleared votes read back as null'
);

select ok(
  public.record_audio_vote(
    'bbbbbbbb-0000-4000-8000-bbbbbbbbbbbb',
    'https://example.com/pgtap-vote.wav',
    'up'
  ) is null,
  'a non-owner cannot vote on the audio'
);

select is(
  (
    select total_votes
    from public.audio_files
    where id = 'dddddddd-0000-4000-8000-dddddddddddd'
  ),
  0,
  'non-owner votes do not change total_votes'
);

select ok(
  public.record_audio_vote(
    'aaaaaaaa-0000-4000-8000-aaaaaaaaaaaa',
    'https://example.com/pgtap-missing.wav',
    'up'
  ) is null,
  'an unknown URL returns null'
);

select throws_ok(
  $$
    select public.record_audio_vote(
      'aaaaaaaa-0000-4000-8000-aaaaaaaaaaaa',
      'https://example.com/pgtap-vote.wav',
      'bogus'
    )
  $$,
  '22023',
  'an invalid vote value raises invalid_parameter_value'
);

-- A second active row with the same URL: the newest row wins and the old
-- row's vote does not carry over.
insert into public.audio_files (
  id, voice_id, user_id, storage_key, duration, text_content, url, model
) values (
  'eeeeeeee-0000-4000-8000-eeeeeeeeeeee',
  'cccccccc-0000-4000-8000-cccccccccccc',
  'aaaaaaaa-0000-4000-8000-aaaaaaaaaaaa',
  'pgtap/vote-replacement.wav',
  1.5,
  'pgtap vote replacement',
  'https://example.com/pgtap-vote.wav',
  'gpro'
);

select is(
  public.record_audio_vote(
    'aaaaaaaa-0000-4000-8000-aaaaaaaaaaaa',
    'https://example.com/pgtap-vote.wav',
    'up'
  ),
  1,
  'a shared URL votes the newest active row'
);

select is(
  (
    select count(*)::integer
    from public.audio_votes
    where audio_file_id = 'eeeeeeee-0000-4000-8000-eeeeeeeeeeee'
  ),
  1,
  'the vote lands on the replacement row'
);

-- Soft-deleted rows are not votable.
update public.audio_files
set status = 'deleted'
where url = 'https://example.com/pgtap-vote.wav';

select ok(
  public.record_audio_vote(
    'aaaaaaaa-0000-4000-8000-aaaaaaaaaaaa',
    'https://example.com/pgtap-vote.wav',
    'up'
  ) is null,
  'deleted audio rows are not votable'
);

select * from finish();

rollback;
