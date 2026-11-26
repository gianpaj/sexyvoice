begin;
set local search_path = public, extensions;
select plan(22);

insert into auth.users (id, aud, role, email) values
  ('14141414-1414-4414-8414-141414141414', 'authenticated', 'authenticated', 'feedback-owner@example.test'),
  ('24242424-2424-4424-8424-242424242424', 'authenticated', 'authenticated', 'feedback-other@example.test');
insert into public.profiles (id, username) values
  ('14141414-1414-4414-8414-141414141414', 'feedback-owner'),
  ('24242424-2424-4424-8424-242424242424', 'feedback-other')
  on conflict (id) do nothing;
insert into public.voices (id, user_id, name, language, model, type) values
  ('34343434-3434-4434-8434-343434343434', '14141414-1414-4414-8414-141414141414',
    'Feedback fixture', 'en', 'grok-voice-think-fast-2.0', 'call');
insert into public.conversations (id, user_id, character_name, language, uses_default_character) values
  ('44444444-4444-4444-8444-444444444444', '14141414-1414-4414-8414-141414141414',
    'Feedback fixture', 'en', true);
insert into public.call_sessions (id, user_id, conversation_id, voice_id, model, livekit_room_name) values
  ('54545454-5454-4454-8454-545454545454', '14141414-1414-4414-8414-141414141414',
    '44444444-4444-4444-8444-444444444444', '34343434-3434-4434-8434-343434343434',
    'inworld-tts', 'voice-chat-54545454-5454-4454-8454-545454545454');
insert into public.audio_files (id, user_id, voice_id, storage_key, url, duration, text_content, model, is_public) values
  ('64646464-6464-4464-8464-646464646464', '14141414-1414-4414-8414-141414141414',
    '34343434-3434-4434-8434-343434343434', 'feedback/one.mp3', 'https://example.test/one.mp3',
    1, 'Hello', 'grok-voice', true),
  ('64646464-6464-4464-8464-646464646465', '24242424-2424-4424-8424-242424242424',
    '34343434-3434-4434-8434-343434343434', 'feedback/two.mp3', 'https://example.test/two.mp3',
    1, 'Hello', 'grok-voice', false);

select ok(not has_table_privilege('anon', 'public.feedback', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE'),
  'anonymous clients have no access to feedback');
select ok(not has_table_privilege('authenticated', 'public.feedback', 'INSERT,UPDATE,DELETE,TRUNCATE'),
  'authenticated clients cannot write feedback directly');

set local role service_role;

select throws_ok($$select public.save_feedback('14141414-1414-4414-8414-141414141414', 'up')$$,
  '22023', null, 'a submission requires a target');
select throws_ok($$select public.save_feedback('14141414-1414-4414-8414-141414141414', 'up',
    'voice-chat-54545454-5454-4454-8454-545454545454', '64646464-6464-4464-8464-646464646464')$$,
  '22023', null, 'a submission accepts only one target');
select throws_ok($$insert into public.feedback (user_id, rating)
    values ('14141414-1414-4414-8414-141414141414', 'up')$$,
  '23514', null, 'the table requires a target');
select throws_ok($$insert into public.feedback (user_id, rating, call_session_id, audio_file_id)
    values ('14141414-1414-4414-8414-141414141414', 'up',
      '54545454-5454-4454-8454-545454545454', '64646464-6464-4464-8464-646464646464')$$,
  '23514', null, 'the table accepts only one target');

select throws_ok($$select public.save_feedback('24242424-2424-4424-8424-242424242424', 'up',
    p_audio_file_id => '64646464-6464-4464-8464-646464646464')$$,
  'P0002', null, 'another user cannot rate a public audio file');
select throws_ok($$select public.save_feedback('24242424-2424-4424-8424-242424242424', 'up',
    p_call_room_name => 'voice-chat-54545454-5454-4454-8454-545454545454')$$,
  'P0002', null, 'another user cannot rate the call');
select throws_ok($$select public.save_feedback('14141414-1414-4414-8414-141414141414', 'up',
    p_call_room_name => 'voice-chat-54545454-5454-4454-8454-545454545454')$$,
  '55000', null, 'the caller can retry after the call ends');

update public.call_sessions set status = 'completed', ended_at = now()
  where id = '54545454-5454-4454-8454-545454545454';
select is(public.save_feedback('14141414-1414-4414-8414-141414141414', 'down',
    p_call_room_name => 'voice-chat-54545454-5454-4454-8454-545454545454',
    p_reason_code => 'other', p_note => 'Long pause'), 'down', 'save a rating for the finished call');
select is(public.save_feedback('14141414-1414-4414-8414-141414141414', 'down',
    p_call_room_name => 'voice-chat-54545454-5454-4454-8454-545454545454',
    p_reason_code => 'other', p_note => 'Long pause'), 'down', 'retry the call rating');
select results_eq($$select rating, reason_code, note from public.feedback
    where call_session_id = '54545454-5454-4454-8454-545454545454'$$,
  $$values ('down'::text, 'other'::text, 'Long pause'::text)$$, 'the retry leaves one call rating with its note');
select is(public.save_feedback('14141414-1414-4414-8414-141414141414', 'up',
    p_call_room_name => 'voice-chat-54545454-5454-4454-8454-545454545454'), 'up', 'the owner can change the call rating');
select results_eq($$select rating, reason_code, note from public.feedback
    where call_session_id = '54545454-5454-4454-8454-545454545454'$$,
  $$values ('up'::text, null::text, null::text)$$, 'the changed call rating clears the prior reason and note');
select is(public.save_feedback('14141414-1414-4414-8414-141414141414', 'up',
    p_audio_file_id => '64646464-6464-4464-8464-646464646464'), 'up', 'save a separate rating for the generated audio');
select is(public.save_feedback('24242424-2424-4424-8424-242424242424', 'down',
    p_audio_file_id => '64646464-6464-4464-8464-646464646465'), 'down', 'another user can rate their own audio');

set local role authenticated;
set local "request.jwt.claim.sub" = '14141414-1414-4414-8414-141414141414';
select is((select count(*)::integer from public.feedback), 2, 'the caller can read only their own ratings');
select throws_ok($$select public.save_feedback('14141414-1414-4414-8414-141414141414', 'up',
    p_audio_file_id => '64646464-6464-4464-8464-646464646464')$$,
  '42501', null, 'the rating RPC is restricted to the server');
set local "request.jwt.claim.sub" = '24242424-2424-4424-8424-242424242424';
select results_eq($$select audio_file_id from public.feedback$$,
  $$values ('64646464-6464-4464-8464-646464646465'::uuid)$$, 'the second user reads only their own rating');

set local role service_role;
update public.audio_files set status = 'deleted' where id = '64646464-6464-4464-8464-646464646464';
select throws_ok($$select public.save_feedback('14141414-1414-4414-8414-141414141414', 'up',
    p_audio_file_id => '64646464-6464-4464-8464-646464646464')$$,
  'P0002', null, 'a soft-deleted file cannot receive feedback');

reset role;
delete from public.audio_files where id = '64646464-6464-4464-8464-646464646464';
delete from public.call_sessions where id = '54545454-5454-4454-8454-545454545454';
select results_eq($$select audio_file_id from public.feedback$$,
  $$values ('64646464-6464-4464-8464-646464646465'::uuid)$$, 'hard-deleting the call and file removes their ratings');

set local role service_role;
select public.erase_account_conversations('24242424-2424-4424-8424-242424242424') as erased_threads \gset
select throws_ok($$select public.save_feedback('24242424-2424-4424-8424-242424242424', 'up',
    p_audio_file_id => '64646464-6464-4464-8464-646464646465')$$,
  'P0002', null, 'the account erasure marker blocks a late feedback request');

select * from finish();
rollback;
