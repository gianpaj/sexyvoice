begin;
set local search_path = public, extensions;
select plan(18);

insert into auth.users (id, aud, role, email) values
  ('10101010-1010-4010-8010-101010101010', 'authenticated', 'authenticated', 'spike-chat-a@example.test'),
  ('20202020-2020-4020-8020-202020202020', 'authenticated', 'authenticated', 'spike-chat-b@example.test');

select ok(not has_table_privilege('authenticated', 'voice_spike_chat_runs', 'SELECT'), 'chat receipts are private');
select ok(not has_function_privilege('authenticated', 'save_voice_spike_chat(uuid,uuid,text,text,jsonb)', 'EXECUTE'), 'browser cannot write replies');

set local role service_role;
select is(public.start_voice_spike_chat(
  '10101010-1010-4010-8010-101010101010', '60606060-6060-4060-8060-606060606061', '70707070-7070-4070-8070-707070707071', 'Remember blue.'
), true, 'first submit starts a new run');
select is(public.start_voice_spike_chat(
  '10101010-1010-4010-8010-101010101010', '60606060-6060-4060-8060-606060606061', '70707070-7070-4070-8070-707070707071', 'Remember blue.'
), false, 'same submit returns the existing receipt');
select throws_ok($$select public.start_voice_spike_chat(
  '10101010-1010-4010-8010-101010101010', '60606060-6060-4060-8060-606060606061', '70707070-7070-4070-8070-707070707071', 'Changed.'
)$$, '23505', null, 'reusing the receipt cannot change the user turn');
select throws_ok($$select public.open_voice_spike_call(
  '10101010-1010-4010-8010-101010101010', '60606060-6060-4060-8060-606060606061', true, 'room-a'
)$$, '23505', null, 'an active chat blocks a call');
select throws_ok($$select public.start_voice_spike_chat(
  '10101010-1010-4010-8010-101010101010', '60606060-6060-4060-8060-606060606062', '70707070-7070-4070-8070-707070707072', 'Another tab.'
)$$, '23505', null, 'an active run also blocks another thread');
select throws_ok($$select public.start_voice_spike_chat(
  '20202020-2020-4020-8020-202020202020', '60606060-6060-4060-8060-606060606061', '70707070-7070-4070-8070-707070707073', 'Other user.'
)$$, 'P0002', null, 'the other user cannot start on the owned thread');
select is(public.save_voice_spike_chat(
  '10101010-1010-4010-8010-101010101010', '70707070-7070-4070-8070-707070707071', 'The door', 'streaming', null
), true, 'streaming checkpoint is durable');
select is((select reply from public.read_voice_spike_chat(
  '10101010-1010-4010-8010-101010101010', '70707070-7070-4070-8070-707070707071'
)), 'The door', 'the owner can replay the partial');
select is((select count(*)::int from public.read_voice_spike_chat(
  '20202020-2020-4020-8020-202020202020', '70707070-7070-4070-8070-707070707071'
)), 0, 'the owner scopes the replay');
select is(public.save_voice_spike_chat(
  '10101010-1010-4010-8010-101010101010', '70707070-7070-4070-8070-707070707071', 'The door is blue.', 'completed', '{"promptTokens":10}'
), true, 'settlement stores the full reply and provider usage');
select lives_ok($$select public.open_voice_spike_call(
  '10101010-1010-4010-8010-101010101010', '60606060-6060-4060-8060-606060606061', true, 'room-a'
)$$, 'chat completion admits a call on the same thread');
select throws_ok($$select public.start_voice_spike_chat(
  '10101010-1010-4010-8010-101010101010', '60606060-6060-4060-8060-606060606061', '70707070-7070-4070-8070-707070707072', 'Too early.'
)$$, '23505', null, 'an active call blocks chat before call history has flushed');
select is(public.save_voice_spike_chat(
  '10101010-1010-4010-8010-101010101010', '70707070-7070-4070-8070-707070707071', 'Stale.', 'completed', null
), false, 'a delayed producer cannot change the finished reply or release the call');
select public.append_voice_spike_message(
  '10101010-1010-4010-8010-101010101010', '60606060-6060-4060-8060-606060606061', 'room-a',
  'spoken', 'user', 'The gate is red.', false
);
delete from public.voice_spike_calls where room_name = 'room-a';
select is(public.start_voice_spike_chat(
  '10101010-1010-4010-8010-101010101010', '60606060-6060-4060-8060-606060606061', '70707070-7070-4070-8070-707070707072', 'What color is the gate?'
), true, 'chat resumes after the call closes');
select public.save_voice_spike_chat(
  '10101010-1010-4010-8010-101010101010', '70707070-7070-4070-8070-707070707072', 'It is', 'streaming', null
) as checkpoint \gset
update public.voice_spike_chat_runs set expires_at = now() - interval '1 second'
  where id = '70707070-7070-4070-8070-707070707072';
select results_eq($$select status, reply from public.read_voice_spike_chat(
  '10101010-1010-4010-8010-101010101010', '70707070-7070-4070-8070-707070707072'
)$$, $$values ('interrupted', 'It is')$$, 'expired producer keeps durable partial text');
select results_eq($$select source, role, parts->0->>'content' from public.conversation_messages
  where conversation_id = '60606060-6060-4060-8060-606060606061' order by position$$,
  $$values ('chat', 'user', 'Remember blue.'), ('chat', 'assistant', 'The door is blue.'),
    ('voice', 'user', 'The gate is red.'), ('chat', 'user', 'What color is the gate?'),
    ('chat', 'assistant', 'It is')$$, 'voice and chat share stable chronological messages');

select * from finish();
rollback;
