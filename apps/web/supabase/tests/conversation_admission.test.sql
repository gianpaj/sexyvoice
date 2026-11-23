begin;
set local search_path = public, extensions;
select plan(15);

insert into auth.users (id, aud, role, email) values
  ('10101010-1010-4010-8010-101010101010', 'authenticated', 'authenticated', 'admission@example.test');
insert into public.voices (id, user_id, name, language, model, type) values
  ('30303030-3030-4030-8030-303030303030', '10101010-1010-4010-8010-101010101010',
   'Admission fixture', 'en', 'grok-voice-think-fast-2.0', 'call');

select ok(not has_function_privilege('authenticated', 'public.has_active_voice_call(uuid)', 'EXECUTE'),
  'the account-wide call lookup is private');
set local role service_role;
insert into public.conversations (id, user_id, character_name, language, uses_default_character)
  values ('60606060-6060-4060-8060-606060606062', '10101010-1010-4010-8010-101010101010',
    'Example', 'en', true);

prepare start_chat as select public.start_voice_chat(
  '10101010-1010-4010-8010-101010101010', '60606060-6060-4060-8060-606060606061',
  '70707070-7070-4070-8070-707070707071', 'I started in chat.');
prepare legacy_call as insert into public.call_sessions (user_id, model, voice_id)
  values ('10101010-1010-4010-8010-101010101010', 'grok-voice-think-fast-2.0',
    '30303030-3030-4030-8030-303030303030');
prepare js_call as select public.open_voice_call(
  '10101010-1010-4010-8010-101010101010', '60606060-6060-4060-8060-606060606061',
  true, 'js-call-room');
prepare another_js_call as select public.open_voice_call(
  '10101010-1010-4010-8010-101010101010', '60606060-6060-4060-8060-606060606062',
  true, 'second-js-call-room');

select lives_ok('execute legacy_call', 'an unlinked legacy call can claim admission');
select ok(public.has_active_voice_call('10101010-1010-4010-8010-101010101010'), 'chat can see an unlinked call');
select throws_ok('execute legacy_call', '23505', null, 'a second legacy call cannot enter');
select throws_ok('execute start_chat', '23505', null, 'an active legacy call blocks chat');
select throws_ok('execute another_js_call', '23505', null, 'an active legacy call blocks a JS lease');
select is_empty($$select id from public.conversations where id = '60606060-6060-4060-8060-606060606061'$$,
  'denied chat creates no thread');
update public.call_sessions set status = 'completed' where user_id = '10101010-1010-4010-8010-101010101010';

select lives_ok('execute start_chat', 'the completed call releases admission');
select ok(not public.has_active_voice_call('10101010-1010-4010-8010-101010101010'), 'a chat lease is not a voice call');
select throws_ok('execute legacy_call', '23505', null, 'an active chat blocks the unlinked legacy path');
select public.save_voice_chat_reply('10101010-1010-4010-8010-101010101010',
  '70707070-7070-4070-8070-707070707071', 'A reply.', 'completed', null);

select lives_ok('execute js_call', 'a JS call can resume an existing chat');
select throws_ok('execute legacy_call', '23505', null, 'a JS call lease blocks the legacy path too');
delete from public.voice_conversation_leases where room_name = 'js-call-room';

insert into public.call_sessions (id, user_id, model, voice_id, conversation_id, livekit_room_name)
  values ('80808080-8080-4080-8080-808080808080', '10101010-1010-4010-8010-101010101010',
    'inworld-tts', '30303030-3030-4030-8030-303030303030',
    '60606060-6060-4060-8060-606060606061', 'linked-call-room');
prepare append_turn as select public.append_voice_call_message(
  '10101010-1010-4010-8010-101010101010', '60606060-6060-4060-8060-606060606061',
  'linked-call-room', 'item-1', 'assistant', 'In voice…', true);
select lives_ok('execute append_turn', 'a linked Python call can append without a second lease');
select is((select call_session_id from public.conversation_messages where id = 'linked-call-room:item-1'),
 '80808080-8080-4080-8080-808080808080'::uuid, 'the turn is linked to the billing record');
update public.call_sessions set status = 'completed' where id = '80808080-8080-4080-8080-808080808080';
select throws_ok('execute append_turn', 'P0002', null, 'a completed linked call cannot append late turns');

select * from finish();
rollback;
