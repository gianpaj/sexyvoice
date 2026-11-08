begin;
select plan(6);

insert into auth.users (id, aud, role, email)
values ('22222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'dual-scope-a@example.com'),
       ('33333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated', 'dual-scope-b@example.com');

insert into public.agent_memories (user_id, character_id, memory_type, content, embedding)
values
  ('22222222-2222-4222-8222-222222222222', '__shared__', 'profile:identity', 'moonlight', ('[1' || repeat(',0', 1535) || ']')::extensions.vector),
  ('22222222-2222-4222-8222-222222222222', 'character-a', 'relationship:dynamic', 'moonlight', ('[1' || repeat(',0', 1535) || ']')::extensions.vector),
  ('22222222-2222-4222-8222-222222222222', 'character-b', 'relationship:dynamic', 'moonlight', ('[1' || repeat(',0', 1535) || ']')::extensions.vector),
  ('33333333-3333-4333-8333-333333333333', '__shared__', 'profile:identity', 'moonlight', ('[1' || repeat(',0', 1535) || ']')::extensions.vector);

create temporary table dual_results as
select * from public.match_agent_memories_hybrid(
  ('[1' || repeat(',0', 1535) || ']')::extensions.vector, 'moonlight',
  '22222222-2222-4222-8222-222222222222', 'character-a', 10);

select is((select count(*)::int from dual_results), 2, 'hybrid search returns shared and active character only');
select is((select array_agg(character_id order by character_id) from dual_results),
  array['__shared__', 'character-a']::text[], 'scope column identifies both partitions');
select ok((select bool_and(vector_rank is not null and text_rank is not null) from dual_results),
  'both retrieval branches include both scopes');
select is((select count(*)::int from public.match_agent_memories_hybrid(
  null, 'moonlight', '22222222-2222-4222-8222-222222222222', 'character-a', 10)), 2,
  'text-only search retains dual scope and user isolation');
select is((select count(*)::int from public.match_agent_memories_hybrid(
  ('[1' || repeat(',0', 1535) || ']')::extensions.vector, '',
  '22222222-2222-4222-8222-222222222222', 'character-a', 10)), 2,
  'vector-only search retains dual scope and user isolation');
select is((select count(*)::int from public.match_agent_memories_hybrid(
  null, 'moonlight', '22222222-2222-4222-8222-222222222222', '__shared__', 10)), 1,
  'legacy shared scope does not include character history');

select * from finish();
rollback;
