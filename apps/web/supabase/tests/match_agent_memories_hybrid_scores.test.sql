-- pgTAP test for public.match_agent_memories_hybrid relevance scores.
--
-- Run with the Supabase CLI against a local DB that has the agent_memories
-- migrations applied (this test is NOT wired into the Vitest CI, which has no
-- Postgres):
--
--   supabase test db
--
-- It seeds one user with three memories — two embedded (one identical to the
-- query vector, one orthogonal) and one with a NULL embedding that only matches
-- the full-text branch — then asserts the additive score columns behave as
-- documented while ranking stays byte-for-byte the same (memory_type / content
-- first, RRF order preserved).

begin;

select plan(11);

-- ── Seed ───────────────────────────────────────────────────────────────────
-- Minimal auth.users row so the agent_memories.user_id FK is satisfied.
insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
values (
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-4111-8111-111111111111',
  'authenticated',
  'authenticated',
  'pgtap-memory@example.com',
  now(),
  now()
);

-- Three memories under the default '__shared__' scope.
--   preferred_name : embedding == query vector            → cosine distance 0
--   hobby          : embedding orthogonal to query vector → cosine distance 1
--   fav_color      : NULL embedding, only matches text 'blue'
insert into public.agent_memories (user_id, character_id, memory_type, content, embedding)
values
  (
    '11111111-1111-4111-8111-111111111111',
    '__shared__',
    'preferred_name',
    'Call me Alex',
    ('[1' || repeat(',0', 1535) || ']')::extensions.vector
  ),
  (
    '11111111-1111-4111-8111-111111111111',
    '__shared__',
    'hobby',
    'Enjoys hiking',
    ('[0,1' || repeat(',0', 1534) || ']')::extensions.vector
  ),
  (
    '11111111-1111-4111-8111-111111111111',
    '__shared__',
    'fav_color',
    'blue',
    null
  );

-- ── Call the RPC ─────────────────────────────────────────────────────────────
-- query_embedding == the preferred_name vector; query_text 'blue' matches only
-- the NULL-embedding fav_color row in the full-text branch.
create temporary table _res on commit drop as
select *, row_number() over () as ord
from public.match_agent_memories_hybrid(
  ('[1' || repeat(',0', 1535) || ']')::extensions.vector,
  'blue',
  '11111111-1111-4111-8111-111111111111'::uuid,
  '__shared__',
  5
);

-- ── (a) Same rows, same order, first two columns intact ─────────────────────
select is(
  (select count(*) from _res)::int, 3,
  'returns all three seeded memories'
);

select is(
  (select array_agg(memory_type order by ord) from _res),
  array['preferred_name', 'hobby', 'fav_color']::text[],
  'rows preserved in RRF order: preferred_name, hobby, fav_color'
);

select is(
  (select content from _res where memory_type = 'preferred_name'),
  'Call me Alex',
  'content stays the second column'
);

-- ── (b) cosine_distance: non-null & ascending for embedded rows, NULL else ──
select isnt(
  (select cosine_distance from _res where memory_type = 'preferred_name'),
  null,
  'embedded row exposes a non-null cosine_distance'
);

select is(
  (select cosine_distance from _res where memory_type = 'fav_color'),
  null,
  'null-embedding row reports NULL cosine_distance'
);

select ok(
  (select cosine_distance from _res where memory_type = 'preferred_name')
    <= (select cosine_distance from _res where memory_type = 'hobby'),
  'cosine_distance ascends with vector rank (nearer row is smaller)'
);

-- ── (c) rrf_score: non-null and monotonically non-increasing ────────────────
select ok(
  (select bool_and(rrf_score is not null) from _res),
  'every row exposes a non-null rrf_score'
);

select ok(
  (
    select bool_and(prev_score >= rrf_score)
    from (
      select rrf_score, lag(rrf_score) over (order by ord) as prev_score
      from _res
    ) ranked
    where prev_score is not null
  ),
  'rrf_score is monotonically non-increasing across the result set'
);

-- ── (d) per-branch ranks: text-only vs vector-only ──────────────────────────
select ok(
  (select vector_rank is null and text_rank is not null
   from _res where memory_type = 'fav_color'),
  'text-only match has vector_rank NULL and a text_rank'
);

select ok(
  (select vector_rank is not null and text_rank is null
   from _res where memory_type = 'preferred_name'),
  'vector-only match has text_rank NULL and a vector_rank'
);

select is(
  (select vector_rank from _res where memory_type = 'preferred_name')::int,
  1,
  'nearest embedded row is vector_rank 1'
);

select * from finish();

rollback;
