begin;
set local search_path = public, extensions;
select plan(15);

insert into auth.users (id, aud, role, email) values
  ('10101010-1010-4010-8010-101010101010', 'authenticated', 'authenticated', 'voice-thread-a@example.test'),
  ('20202020-2020-4020-8020-202020202020', 'authenticated', 'authenticated', 'voice-thread-b@example.test');

select ok(not has_table_privilege('authenticated', 'public.voice_conversation_leases', 'SELECT,INSERT,UPDATE,DELETE'),
  'call leases are private');
select ok(not has_function_privilege('authenticated', 'public.open_voice_call(uuid,uuid,boolean,text)', 'EXECUTE'),
  'the browser cannot open a worker lease');
select ok(not has_function_privilege('authenticated', 'public.append_voice_call_message(uuid,uuid,text,text,text,text,boolean)', 'EXECUTE'),
  'the browser cannot write committed turns');

set local role service_role;
select is((public.open_voice_call(
  '10101010-1010-4010-8010-101010101010', '60606060-6060-4060-8060-606060606061', false, 'room-a'
)).uses_default_character, true, 'first call creates a demo thread');
select throws_ok($$select public.open_voice_call(
  '10101010-1010-4010-8010-101010101010', '60606060-6060-4060-8060-606060606062', false, 'room-b')$$,
  '23505', null, 'one voice call per user even on different threads');
select throws_ok($$select public.open_voice_call(
  '20202020-2020-4020-8020-202020202020', '60606060-6060-4060-8060-606060606061', true, 'room-b')$$,
  'P0002', null, 'another user cannot resume the thread');
select lives_ok($$select public.append_voice_call_message(
  '10101010-1010-4010-8010-101010101010', '60606060-6060-4060-8060-606060606061', 'room-a',
  'sdk-1', 'user', 'Hello', false)$$, 'the worker stores a committed turn');
select lives_ok($$select public.append_voice_call_message(
  '10101010-1010-4010-8010-101010101010', '60606060-6060-4060-8060-606060606061', 'room-a',
  'sdk-1', 'user', 'Hello', false)$$, 'replay of the same SDK item is safe');
select lives_ok($$select public.append_voice_call_message(
  '10101010-1010-4010-8010-101010101010', '60606060-6060-4060-8060-606060606061', 'room-a',
  'sdk-2', 'assistant', 'Hola', true)$$, 'interrupted replies can retain committed text');
select results_eq($$select position, role, status, parts->0->>'content' from public.conversation_messages
  where conversation_id = '60606060-6060-4060-8060-606060606061' order by position$$,
  $$values (1::bigint, 'user', 'completed', 'Hello'), (2::bigint, 'assistant', 'interrupted', 'Hola')$$,
  'only committed visible text is retained in order');
select is((select revision from public.conversations where id = '60606060-6060-4060-8060-606060606061'),
  2::bigint, 'a replay does not revise the thread');
select is((select count(*)::int from public.call_sessions where user_id = '10101010-1010-4010-8010-101010101010'),
  0, 'demo history does not create a billable call');
delete from public.voice_conversation_leases where user_id = '10101010-1010-4010-8010-101010101010';
select lives_ok($$select public.open_voice_call(
  '10101010-1010-4010-8010-101010101010', '60606060-6060-4060-8060-606060606061', true, 'room-b')$$,
  'the owner can redial after cleanup');
select throws_ok($$select public.append_voice_call_message(
  '10101010-1010-4010-8010-101010101010', '60606060-6060-4060-8060-606060606061', 'room-a',
  'sdk-3', 'user', 'Stale', false)$$, 'P0002', null, 'stale room cannot write after redial');
select lives_ok($$select public.append_voice_call_message(
  '10101010-1010-4010-8010-101010101010', '60606060-6060-4060-8060-606060606061', 'room-b',
  'sdk-1', 'user', 'Second call', false)$$, 'a new call can reuse an SDK item ID');

select * from finish();
rollback;
