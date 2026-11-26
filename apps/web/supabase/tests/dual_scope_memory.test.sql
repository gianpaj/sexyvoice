begin;
set local search_path = public, extensions;
select plan(12);

select ok(exists (
  select 1
  from pg_catalog.pg_proc p
  join pg_catalog.pg_type t on t.oid = p.proargtypes[0]
  join pg_catalog.pg_extension e on e.extnamespace = t.typnamespace
  where p.pronamespace = 'public'::regnamespace
    and p.proname = 'match_agent_memories_hybrid'
    and t.typname = 'vector' and e.extname = 'vector'
), 'memory RPC uses the installed pgvector type');

insert into auth.users (id, aud, role, email)
values ('22222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'dual-scope-a@example.com'),
       ('33333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated', 'dual-scope-b@example.com');

insert into public.agent_memories (user_id, character_id, memory_type, content, embedding)
values
  ('22222222-2222-4222-8222-222222222222', '__shared__', 'profile:identity', 'moonlight user a', ('[1' || repeat(',0', 1535) || ']')::vector),
  ('22222222-2222-4222-8222-222222222222', 'character-a', 'relationship:dynamic', 'moonlight story a', ('[1' || repeat(',0', 1535) || ']')::vector),
  ('22222222-2222-4222-8222-222222222222', 'character-b', 'relationship:dynamic', 'moonlight story b', ('[1' || repeat(',0', 1535) || ']')::vector),
  ('33333333-3333-4333-8333-333333333333', '__shared__', 'profile:identity', 'moonlight user b', ('[1' || repeat(',0', 1535) || ']')::vector);

create temporary table dual_results as
select * from public.match_agent_memories_hybrid(
  ('[1' || repeat(',0', 1535) || ']')::vector, 'moonlight',
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
  ('[1' || repeat(',0', 1535) || ']')::vector, '',
  '22222222-2222-4222-8222-222222222222', 'character-a', 10)), 2,
  'vector-only search retains dual scope and user isolation');
select is((select count(*)::int from public.match_agent_memories_hybrid(
  null, 'moonlight', '22222222-2222-4222-8222-222222222222', '__shared__', 10)), 1,
  'legacy shared scope does not include character history');

select is((select array_agg(content order by content) from dual_results),
  array['moonlight story a', 'moonlight user a']::text[], 'mixed search returns this user content');
select is((select array_agg(content order by content) from public.match_agent_memories_hybrid(
  null, 'moonlight', '22222222-2222-4222-8222-222222222222', 'character-a', 10)),
  array['moonlight story a', 'moonlight user a']::text[], 'text search returns this user content');
select is((select array_agg(content order by content) from public.match_agent_memories_hybrid(
  ('[1' || repeat(',0', 1535) || ']')::vector, '',
  '22222222-2222-4222-8222-222222222222', 'character-a', 10)),
  array['moonlight story a', 'moonlight user a']::text[], 'vector search returns this user content');

select is((select character_id from dual_results order by rrf_score desc limit 1),
  'character-a', 'active character outranks an equally matched shared memory');

insert into public.agent_memories (user_id, character_id, memory_type, content, updated_at)
values
  ('22222222-2222-4222-8222-222222222222', '__shared__', 'fact:older', 'sunset', now() - interval '60 days'),
  ('22222222-2222-4222-8222-222222222222', '__shared__', 'fact:newer', 'sunset', now());
select is((select memory_type from public.match_agent_memories_hybrid(
  null, 'sunset', '22222222-2222-4222-8222-222222222222', '__shared__', 10)
  order by rrf_score desc limit 1),
  'fact:newer', 'recency boost favors the equally matched recent memory');

select * from finish();
rollback;
