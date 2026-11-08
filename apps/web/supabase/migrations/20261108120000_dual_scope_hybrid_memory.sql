-- Migration: 20261108120000_dual_scope_hybrid_memory.sql
-- Upgrade match_agent_memories_hybrid to search both the active character_id
-- and '__shared__' user-wide memories in one round-trip, and return character_id.

-- Adding a result column requires DROP because CREATE OR REPLACE cannot
-- change a table return type. Argument types and the first six columns stay stable.
DROP FUNCTION IF EXISTS public.match_agent_memories_hybrid(
  extensions.vector, text, uuid, text, int
);

CREATE OR REPLACE FUNCTION public.match_agent_memories_hybrid(
  query_embedding extensions.vector(1536),
  query_text      text,
  p_user_id       uuid,
  p_character_id  text DEFAULT '__shared__',
  match_count     int  DEFAULT 5
)
RETURNS TABLE (
  memory_type     text,
  content         text,
  cosine_distance double precision,
  rrf_score       double precision,
  vector_rank     int,
  text_rank       int,
  character_id    text
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH vector_ranked AS (
    SELECT m.id,
           row_number() OVER (ORDER BY m.embedding OPERATOR(extensions.<=>) query_embedding ASC) AS rank
    FROM public.agent_memories m
    WHERE m.user_id = p_user_id
      AND m.character_id IN (p_character_id, '__shared__')
      AND m.embedding IS NOT NULL
      -- A null query vector must not rank arbitrary rows; use text matches only.
      AND query_embedding IS NOT NULL
    ORDER BY m.embedding OPERATOR(extensions.<=>) query_embedding ASC
    LIMIT least(greatest(match_count, 1) * 4, 50)
  ),
  text_ranked AS (
    SELECT m.id,
           row_number() OVER (
             ORDER BY ts_rank_cd(m.fts, websearch_to_tsquery('simple', query_text)) DESC
           ) AS rank
    FROM public.agent_memories m
    WHERE m.user_id = p_user_id
      AND m.character_id IN (p_character_id, '__shared__')
      AND query_text IS NOT NULL
      AND query_text <> ''
      AND m.fts @@ websearch_to_tsquery('simple', query_text)
    ORDER BY ts_rank_cd(m.fts, websearch_to_tsquery('simple', query_text)) DESC
    LIMIT least(greatest(match_count, 1) * 4, 50)
  ),
  fused AS (
    SELECT coalesce(v.id, t.id) AS id,
           v.rank               AS vector_rank,
           t.rank               AS text_rank,
           coalesce(0.7 / (60 + v.rank), 0.0)
             + coalesce(0.3 / (60 + t.rank), 0.0) AS score
    FROM vector_ranked v
    FULL OUTER JOIN text_ranked t ON v.id = t.id
  )
  -- Re-rank only the bounded candidate set: 0.7 vector / 0.3 text RRF, k=60.
  -- Active-character matches gain 15%; recency adds up to 10% with a 30-day
  -- exponential decay (2,592,000 seconds). Shared-only requests get no scope boost.
  -- Distance is null for text-only matches; branch ranks identify match provenance.
  SELECT m.memory_type,
         m.content,
         (m.embedding OPERATOR(extensions.<=>) query_embedding)::double precision AS cosine_distance,
         (
           f.score
           * CASE WHEN m.character_id = p_character_id AND p_character_id <> '__shared__' THEN 1.15 ELSE 1.0 END
           * (1.0 + 0.10 * exp(-greatest(extract(epoch FROM (now() - m.updated_at)), 0.0) / 2592000.0))
         )::double precision                                 AS rrf_score,
         f.vector_rank::int                                  AS vector_rank,
         f.text_rank::int                                    AS text_rank,
         m.character_id                                      AS character_id
  FROM fused f
  JOIN public.agent_memories m ON m.id = f.id
  ORDER BY rrf_score DESC
  LIMIT greatest(match_count, 1);
$$;

GRANT EXECUTE ON FUNCTION public.match_agent_memories_hybrid(
  extensions.vector, text, uuid, text, int
) TO authenticated, service_role;
