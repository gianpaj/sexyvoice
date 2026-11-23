begin;
set local search_path = public, extensions;
select plan(6);

insert into auth.users (id, aud, role, email) values
  ('10101010-1010-4010-8010-101010101010', 'authenticated', 'authenticated', 'context-a@example.test'),
  ('20202020-2020-4020-8020-202020202020', 'authenticated', 'authenticated', 'context-b@example.test');
insert into public.conversations (id, user_id, character_name, language) values
  ('60606060-6060-4060-8060-606060606061', '10101010-1010-4010-8010-101010101010', 'Example', 'en');

insert into public.conversation_messages
  (conversation_id, id, position, role, source, parts, status) values
  ('60606060-6060-4060-8060-606060606061', 'two', 2, 'assistant', 'chat',
    '[{"type":"text","content":"Partial"}]', 'interrupted'),
  ('60606060-6060-4060-8060-606060606061', 'one', 1, 'user', 'chat',
    '[{"type":"text","content":"First"},{"type":"text","content":"line two"}]', 'completed'),
  ('60606060-6060-4060-8060-606060606061', 'three', 3, 'assistant', 'chat',
    '[{"type":"text","content":"Secret draft"}]', 'streaming'),
  ('60606060-6060-4060-8060-606060606061', 'four', 4, 'assistant', 'chat',
    '[{"type":"text","content":"\n\t "}]', 'completed');

select ok(not has_function_privilege('authenticated', 'public.read_conversation_context(uuid,uuid)', 'EXECUTE'),
  'projection is server-only');
set local role service_role;

prepare context_read as select * from public.read_conversation_context(
  '10101010-1010-4010-8010-101010101010', '60606060-6060-4060-8060-606060606061');
select results_eq('execute context_read', $$values ('one', 'user', E'First\nline two', false),
  ('two', 'assistant', 'Partial', true)$$,
  'visible context is chronological and preserves interrupted text');

select is_empty($$select * from public.read_conversation_context(
  '20202020-2020-4020-8020-202020202020', '60606060-6060-4060-8060-606060606061')$$,
  'another user cannot load context');

update public.conversation_messages set parts = '[{"type":"text","content":"Revised"}]'
  where conversation_id = '60606060-6060-4060-8060-606060606061' and id = 'two';
select results_eq('execute context_read', $$values ('one', 'user', E'First\nline two', false),
  ('two', 'assistant', 'Revised', true)$$, 'resume reads the latest revision of the same message');

insert into public.conversation_messages (conversation_id, id, position, role, source, parts)
select '60606060-6060-4060-8060-606060606061', 'extra-' || n, n, 'user', 'chat',
  '[{"type":"text","content":"Last"}]' from generate_series(5, 45) n;
select is((select count(*) from public.read_conversation_context(
  '10101010-1010-4010-8010-101010101010', '60606060-6060-4060-8060-606060606061')),
  32::bigint, 'context limits the newest committed rows');

update public.conversation_messages
  set parts = jsonb_build_array(jsonb_build_object('type', 'text', 'content', 'leading' || repeat('😀', 12000)))
  where conversation_id = '60606060-6060-4060-8060-606060606061' and position = 45;
select results_eq('execute context_read',
  $$select 'extra-45'::text, 'user'::text, repeat('😀', 12000), false$$,
  'the newest turn retains its suffix without splitting Unicode');

select * from finish();
rollback;
