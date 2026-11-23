begin;
set local search_path = public, extensions;
select plan(20);

insert into auth.users (id, aud, role, email) values
  ('10101010-1010-4010-8010-101010101010', 'authenticated', 'authenticated', 'erase-chat@example.test'),
  ('20202020-2020-4020-8020-202020202020', 'authenticated', 'authenticated', 'erase-call@example.test'),
  ('30303030-3030-4030-8030-303030303030', 'authenticated', 'authenticated', 'keep-chat@example.test');
insert into public.profiles (id, username) values
  ('20202020-2020-4020-8020-202020202020', 'erase-call')
  on conflict (id) do nothing;
insert into public.voices (id, user_id, name, language, model, type) values
  ('90909090-9090-4090-8090-909090909090', '20202020-2020-4020-8020-202020202020',
   'Erasure fixture', 'en', 'grok-voice-think-fast-2.0', 'call');

select ok(not has_function_privilege('authenticated', 'public.erase_account_conversations(uuid)', 'EXECUTE'),
  'only trusted server code can erase an account history');
select ok(not has_table_privilege('authenticated', 'public.account_conversation_erasures', 'SELECT,INSERT,UPDATE,DELETE'),
  'browser cannot inspect or change erasure records');

set local role service_role;
select public.start_voice_chat(
  '10101010-1010-4010-8010-101010101010', '60606060-6060-4060-8060-606060606061',
  '70707070-7070-4070-8070-707070707071', 'Erase my chat.'
) as chat_started \gset
select public.open_voice_call(
  '20202020-2020-4020-8020-202020202020', '60606060-6060-4060-8060-606060606062',
  false, 'erase-room'
) is not null as call_started \gset
select public.append_voice_call_message(
  '20202020-2020-4020-8020-202020202020', '60606060-6060-4060-8060-606060606062',
  'erase-room', 'first', 'user', 'Erase my call.', false
);
select public.start_voice_chat(
  '30303030-3030-4030-8030-303030303030', '60606060-6060-4060-8060-606060606063',
  '70707070-7070-4070-8070-707070707073', 'Keep my chat.'
) as other_chat_started \gset
insert into public.call_sessions (id, user_id, conversation_id, model, voice_id, credits_used)
values ('80808080-8080-4080-8080-808080808080', '20202020-2020-4020-8020-202020202020',
  '60606060-6060-4060-8060-606060606062', 'inworld-tts', '90909090-9090-4090-8090-909090909090', 500);

select is(public.erase_account_conversations('10101010-1010-4010-8010-101010101010'), 1, 'erase the active chat thread');
select is(public.erase_account_conversations('20202020-2020-4020-8020-202020202020'), 1, 'erase the active call thread');
select is(public.erase_account_conversations('20202020-2020-4020-8020-202020202020'), 0, 'erasure is idempotent');

select is((select count(*)::int from public.conversations where id in ('60606060-6060-4060-8060-606060606061', '60606060-6060-4060-8060-606060606062', '60606060-6060-4060-8060-606060606063')), 1, 'keep the other account thread');
select is((select count(*)::int from public.conversation_messages where conversation_id in ('60606060-6060-4060-8060-606060606061', '60606060-6060-4060-8060-606060606062', '60606060-6060-4060-8060-606060606063')), 1, 'only the other account turn remains');
select is((select count(*)::int from public.voice_chat_runs where conversation_id in ('60606060-6060-4060-8060-606060606061', '60606060-6060-4060-8060-606060606062', '60606060-6060-4060-8060-606060606063')), 1, 'remove the erased chat stream receipt');
select is((select count(*)::int from public.voice_conversation_leases where conversation_id in ('60606060-6060-4060-8060-606060606061', '60606060-6060-4060-8060-606060606062', '60606060-6060-4060-8060-606060606063')), 1, 'release the erased chat and call leases');
select is((select conversation_id from public.call_sessions where id = '80808080-8080-4080-8080-808080808080'),
  null::uuid, 'unlink retained call billing');
select is((select credits_used from public.call_sessions where id = '80808080-8080-4080-8080-808080808080'),
  500, 'preserve call credit accounting');

select is(public.save_voice_chat_reply(
  '10101010-1010-4010-8010-101010101010', '70707070-7070-4070-8070-707070707071', 'Late.', 'completed', null
), false, 'an in-flight chat cannot restore its reply');
select throws_ok($$select public.append_voice_call_message(
  '20202020-2020-4020-8020-202020202020', '60606060-6060-4060-8060-606060606062',
  'erase-room', 'late', 'assistant', 'Late.', false
)$$, 'P0002', null, 'an in-flight worker cannot restore its transcript');
select throws_ok($$select public.start_voice_chat(
  '10101010-1010-4010-8010-101010101010', '60606060-6060-4060-8060-606060606061',
  '70707070-7070-4070-8070-707070707071', 'Erase my chat.'
)$$, 'P0002', null, 'a retried chat request cannot recreate the thread');
select throws_ok($$select public.open_voice_call(
  '20202020-2020-4020-8020-202020202020', '60606060-6060-4060-8060-606060606064', false, 'stale-room'
)$$, 'P0002', null, 'a delayed call token cannot create a thread');
select is((select count(*)::int from public.conversations where id in ('60606060-6060-4060-8060-606060606061', '60606060-6060-4060-8060-606060606062', '60606060-6060-4060-8060-606060606063')), 1, 'late writers left the database unchanged');

update public.account_conversation_erasures
  set blocked_until = pg_catalog.clock_timestamp() - interval '1 second'
  where user_id in ('10101010-1010-4010-8010-101010101010', '20202020-2020-4020-8020-202020202020');
select is(public.start_voice_chat(
  '10101010-1010-4010-8010-101010101010', '60606060-6060-4060-8060-606060606065',
  '70707070-7070-4070-8070-707070707075', 'Fresh chat.'
), true, 'a retained account can start fresh after the erasure lock expires');
select throws_ok($$select public.open_voice_call(
  '20202020-2020-4020-8020-202020202020', '60606060-6060-4060-8060-606060606062', true, 'resume-erased-room'
)$$, 'P0002', null, 'expiry does not restore the erased thread');
select is(public.erase_account_conversations('20202020-2020-4020-8020-202020202020'), 0,
  'erasing again renews an expired lock even when the account has no threads');
select throws_ok($$select public.open_voice_call(
  '20202020-2020-4020-8020-202020202020', '60606060-6060-4060-8060-606060606066', false, 'blocked-room'
)$$, 'P0002', null, 'the renewed lock blocks new writes');

select * from finish();
rollback;
