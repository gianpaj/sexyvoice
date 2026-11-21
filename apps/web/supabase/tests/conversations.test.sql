-- Run with pnpm test:db after applying migrations to local Supabase.
begin;
set local search_path = public, extensions;
select no_plan();

select has_table('public', 'conversations', 'threads have their own table');
select has_table('public', 'conversation_messages', 'messages have their own table');
select has_column('public', 'call_sessions', 'conversation_id', 'calls can join a thread');
select ok((select relrowsecurity from pg_catalog.pg_class where oid = 'public.conversations'::regclass),
  'threads have RLS');
select ok((select relrowsecurity from pg_catalog.pg_class where oid = 'public.conversation_messages'::regclass),
  'messages have RLS');
select ok(not has_table_privilege('anon', 'public.conversations', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),
  'anonymous users have no thread privileges');
select ok(not has_table_privilege('anon', 'public.conversation_messages', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),
  'anonymous users have no message privileges');
select ok(has_table_privilege('authenticated', 'public.conversations', 'SELECT')
  and not has_table_privilege('authenticated', 'public.conversations', 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),
  'authenticated users can only read threads');
select ok(has_table_privilege('authenticated', 'public.conversation_messages', 'SELECT')
  and not has_table_privilege('authenticated', 'public.conversation_messages', 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),
  'authenticated users can only read messages');
select ok(has_table_privilege('service_role', 'public.conversations', 'INSERT')
  and has_table_privilege('service_role', 'public.conversation_messages', 'INSERT'),
  'backend can persist threads and messages');

insert into auth.users (id, aud, role, email) values
  ('10101010-1010-4010-8010-101010101010', 'authenticated', 'authenticated', 'conversations-a@example.com'),
  ('20202020-2020-4020-8020-202020202020', 'authenticated', 'authenticated', 'conversations-b@example.com');
insert into public.profiles (id, username) values
  ('10101010-1010-4010-8010-101010101010', 'conversations-a'),
  ('20202020-2020-4020-8020-202020202020', 'conversations-b')
on conflict (id) do nothing;
insert into public.voices (id, user_id, name, language, model, type) values
  ('30303030-3030-4030-8030-303030303030', '10101010-1010-4010-8010-101010101010',
   'Conversation fixture', 'en', 'grok-voice-think-fast-2.0', 'call');
insert into public.prompts (id, user_id, type, prompt, is_public) values
  ('40404040-4040-4040-8040-404040404040', '10101010-1010-4010-8010-101010101010', 'call', 'Fixture', true);
insert into public.characters (id, user_id, prompt_id, voice_id, name, is_public) values
  ('50505050-5050-4050-8050-505050505050', '10101010-1010-4010-8010-101010101010',
   '40404040-4040-4040-8040-404040404040', '30303030-3030-4030-8030-303030303030', 'Fixture character', true);

set local role service_role;
insert into public.conversations (id, user_id, character_id, character_name, language) values
  ('60606060-6060-4060-8060-606060606061', '10101010-1010-4010-8010-101010101010', '50505050-5050-4050-8050-505050505050', 'Fixture character', 'en'),
  ('60606060-6060-4060-8060-606060606062', '10101010-1010-4010-8010-101010101010', '50505050-5050-4050-8050-505050505050', 'Fixture character', 'en'),
  ('60606060-6060-4060-8060-606060606063', '20202020-2020-4020-8020-202020202020', '50505050-5050-4050-8050-505050505050', 'Fixture character', 'en');
select is((select count(*)::int from public.conversations where user_id = '10101010-1010-4010-8010-101010101010'),
  2, 'one user can keep multiple threads with the same character');

insert into public.call_sessions (id, user_id, model, voice_id, conversation_id) values
  ('70707070-7070-4070-8070-707070707071', '10101010-1010-4010-8010-101010101010', 'inworld-tts', '30303030-3030-4030-8030-303030303030', '60606060-6060-4060-8060-606060606061'),
  ('70707070-7070-4070-8070-707070707072', '20202020-2020-4020-8020-202020202020', 'inworld-tts', '30303030-3030-4030-8030-303030303030', '60606060-6060-4060-8060-606060606063'),
  ('70707070-7070-4070-8070-707070707073', '10101010-1010-4010-8010-101010101010', 'inworld-tts', '30303030-3030-4030-8030-303030303030', null);

insert into public.conversation_messages (conversation_id, id, position, role, source, parts) values
  ('60606060-6060-4060-8060-606060606061', 'user-1', 1, 'user', 'chat', '[{"type":"text","content":"Hello"}]'),
  ('60606060-6060-4060-8060-606060606061', 'assistant-1', 2, 'assistant', 'chat', '[{"type":"text","content":"Hi"}]'),
  ('60606060-6060-4060-8060-606060606062', 'user-1', 1, 'user', 'chat', '[{"type":"text","content":"Another thread"}]'),
  ('60606060-6060-4060-8060-606060606063', 'user-1', 1, 'user', 'chat', '[{"type":"text","content":"Private B"}]');
insert into public.conversation_messages
  (conversation_id, id, position, role, source, parts, call_session_id, source_item_id, status)
values ('60606060-6060-4060-8060-606060606061', 'voice-1', 3, 'assistant', 'voice',
  '[{"type":"text","content":"Partial speech"}]', '70707070-7070-4070-8070-707070707071', 'sdk-item-1', 'interrupted');

-- Force source-link failures inside throws_ok; production checks at commit.
set constraints conversation_messages_call_fkey immediate;

select results_eq($$select id from public.conversation_messages
  where conversation_id = '60606060-6060-4060-8060-606060606061' order by position$$,
  $$values ('user-1'), ('assistant-1'), ('voice-1')$$,
  'chat and voice share chronological order');
select is((select revision from public.conversations where id = '60606060-6060-4060-8060-606060606061'),
  3::bigint, 'message inserts advance the thread revision');
select throws_ok($$insert into public.conversation_messages (conversation_id, id, position, role, source)
  values ('60606060-6060-4060-8060-606060606061', 'user-1', 4, 'user', 'chat')$$,
  '23505', null, 'duplicate message IDs are rejected within a thread');
select throws_ok($$insert into public.conversation_messages (conversation_id, id, position, role, source)
  values ('60606060-6060-4060-8060-606060606061', 'duplicate-position', 2, 'user', 'chat')$$,
  '23505', null, 'two messages cannot occupy one thread position');
select throws_ok($$insert into public.conversation_messages (conversation_id, id, position, role, source)
  values ('60606060-6060-4060-8060-606060606061', 'system-prompt', 4, 'system', 'chat')$$,
  '23514', null, 'internal system instructions are not conversation messages');
select throws_ok($$insert into public.conversation_messages (conversation_id, id, position, role, source, parts)
  values ('60606060-6060-4060-8060-606060606061', 'thinking', 4, 'assistant', 'chat', '[{"type":"thinking","content":"private"}]')$$,
  '23514', null, 'private reasoning is not stored in visible message parts');
select throws_ok($$insert into public.conversation_messages (conversation_id, id, position, role, source, parts)
  values ('60606060-6060-4060-8060-606060606061', 'malformed', 4, 'assistant', 'chat', '[{"type":"text"}]')$$,
  '23514', null, 'text parts require string content');
select throws_ok($$insert into public.conversation_messages (conversation_id, id, position, role, source, parts)
  values ('60606060-6060-4060-8060-606060606061', 'metadata-leak', 4, 'assistant', 'chat', '[{"type":"text","content":"answer","metadata":{"secret":"value"}}]')$$,
  '23514', null, 'visible parts do not accept arbitrary internal metadata');
select throws_ok($$insert into public.conversation_messages (conversation_id, id, position, role, source, parts)
  values ('60606060-6060-4060-8060-606060606061', 'not-array', 4, 'assistant', 'chat', '{}')$$,
  '23514', null, 'message parts must be an array');
select throws_ok($$insert into public.conversation_messages (conversation_id, id, position, role, source, parts)
  values ('60606060-6060-4060-8060-606060606061', 'scalar-part', 4, 'assistant', 'chat', '[42]')$$,
  '23514', null, 'scalar parts fail validation without a JSON operator error');
select throws_ok($$insert into public.conversation_messages (conversation_id, id, position, role, source, status)
  values ('60606060-6060-4060-8060-606060606061', 'bad-status', 4, 'assistant', 'chat', 'mystery')$$,
  '23514', null, 'message lifecycle states are constrained');
select throws_ok($$insert into public.conversation_messages
  (conversation_id, id, position, role, source, call_session_id, source_item_id)
  values ('60606060-6060-4060-8060-606060606061', 'duplicate-sdk-item', 4, 'assistant', 'voice',
  '70707070-7070-4070-8070-707070707071', 'sdk-item-1')$$,
  '23505', null, 'a repeated final call item cannot create a duplicate message');
select throws_ok($$insert into public.conversation_messages
  (conversation_id, id, position, role, source, call_session_id, source_item_id)
  values ('60606060-6060-4060-8060-606060606062', 'wrong-thread', 2, 'assistant', 'voice',
  '70707070-7070-4070-8070-707070707071', 'sdk-item-2')$$,
  '23503', null, 'a call item cannot be attached to a different thread');
select throws_ok($$update public.call_sessions set conversation_id = '60606060-6060-4060-8060-606060606061'
  where id = '70707070-7070-4070-8070-707070707072'$$,
  '23503', null, 'a call cannot link to another user thread');
select throws_ok($$insert into public.conversation_messages
  (conversation_id, id, position, role, source, call_session_id)
  values ('60606060-6060-4060-8060-606060606061', 'chat-call-link', 4, 'user', 'chat', '70707070-7070-4070-8070-707070707071')$$,
  '23514', null, 'typed messages cannot masquerade as call items');

update public.conversation_messages set parts = '[{"type":"text","content":"Corrected speech"}]'
where conversation_id = '60606060-6060-4060-8060-606060606061' and id = 'voice-1';
select is((select revision from public.conversation_messages where conversation_id = '60606060-6060-4060-8060-606060606061' and id = 'voice-1'),
  2::bigint, 'a corrected transcription keeps its ID and advances its revision');
select is((select revision from public.conversations where id = '60606060-6060-4060-8060-606060606061'),
  4::bigint, 'corrections advance the thread revision');
select is((select status from public.conversation_messages where conversation_id = '60606060-6060-4060-8060-606060606061' and id = 'voice-1'),
  'interrupted', 'corrections preserve interrupted speech state');

select throws_ok($$update public.conversation_messages set id = 'replacement-id'
  where conversation_id = '60606060-6060-4060-8060-606060606061' and id = 'assistant-1'$$,
  '23514', null, 'message identity cannot change during correction');
select lives_ok($$update public.conversation_messages
  set position = case position when 1 then 2 when 2 then 1 end
  where conversation_id = '60606060-6060-4060-8060-606060606061' and position in (1, 2)$$,
  'one atomic update can reconcile delayed call ordering');
select results_eq($$select id from public.conversation_messages
  where conversation_id = '60606060-6060-4060-8060-606060606061' order by position$$,
  $$values ('assistant-1'), ('user-1'), ('voice-1')$$,
  'ordering follows explicit positions rather than creation time');

reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = '10101010-1010-4010-8010-101010101010';
select is((select count(*)::int from public.conversations), 2, 'user A sees only owned threads');
select is((select count(*)::int from public.conversation_messages), 4, 'user A sees only owned messages');
select throws_ok($$insert into public.conversations (user_id, character_name, language)
  values ('10101010-1010-4010-8010-101010101010', 'Forged', 'en')$$,
  '42501', null, 'browser cannot create a thread outside admission');
select throws_ok($$update public.conversation_messages set parts = '[]' where id = 'voice-1'$$,
  '42501', null, 'browser cannot overwrite saved messages');
select throws_ok($$update public.call_sessions set conversation_id = '60606060-6060-4060-8060-606060606061'
  where id = '70707070-7070-4070-8070-707070707073'$$,
  '42501', null, 'browser cannot attach a legacy call to a thread');
select lives_ok($$update public.call_sessions set status = 'completed'
  where id = '70707070-7070-4070-8070-707070707073'$$,
  'legacy call updates without a thread link remain compatible');
select throws_ok($$insert into public.call_sessions (user_id, model, voice_id, conversation_id)
  values ('10101010-1010-4010-8010-101010101010', 'inworld-tts', '30303030-3030-4030-8030-303030303030', '60606060-6060-4060-8060-606060606061')$$,
  '42501', null, 'browser cannot insert a linked call');

select lives_ok($$insert into public.call_sessions (user_id, model, voice_id)
  values ('10101010-1010-4010-8010-101010101010', 'inworld-tts', '30303030-3030-4030-8030-303030303030')$$,
  'legacy client call inserts without a thread link remain compatible');

set local "request.jwt.claim.sub" = '20202020-2020-4020-8020-202020202020';
select is((select count(*)::int from public.conversations), 1, 'user B cannot read user A threads');
select is((select count(*)::int from public.conversation_messages), 1, 'user B cannot read user A messages');
reset role;

-- Source deletion preserves conversation text; thread deletion unlinks diagnostics.
delete from public.characters where id = '50505050-5050-4050-8050-505050505050';
select is((select character_id from public.conversations where id = '60606060-6060-4060-8060-606060606061'),
  null::uuid, 'character deletion preserves the thread');
select is((select character_name from public.conversations where id = '60606060-6060-4060-8060-606060606061'),
  'Fixture character', 'a character name snapshot labels retained history');
delete from public.call_sessions where id = '70707070-7070-4070-8070-707070707071';
select is((select call_session_id from public.conversation_messages where conversation_id = '60606060-6060-4060-8060-606060606061' and id = 'voice-1'),
  null::uuid, 'call deletion preserves its visible message');
select is((select count(*)::int from public.conversation_messages where conversation_id = '60606060-6060-4060-8060-606060606061'),
  3, 'call deletion does not erase thread history');
set constraints conversation_messages_call_fkey deferred;
delete from public.conversations where id = '60606060-6060-4060-8060-606060606063';
set constraints conversation_messages_call_fkey immediate;
select is((select count(*)::int from public.conversation_messages where conversation_id = '60606060-6060-4060-8060-606060606063'),
  0, 'deleting a thread deletes its messages');
select is((select conversation_id from public.call_sessions where id = '70707070-7070-4070-8070-707070707072'),
  null::uuid, 'thread deletion retains the separate call record');

select * from finish();
rollback;
