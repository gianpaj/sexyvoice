-- Migration: 20260626130000_match_agent_memories_hybrid_scores.sql
-- Surface relevance scores from public.match_agent_memories_hybrid so the voice
-- agent (sexycall, src/observability.py) can log retrieval quality.
--
-- Today the RPC already computes the cosine distance, the per-branch RRF ranks,
-- and the fused score, but discards them in the final SELECT. Reciprocal Rank
-- Fusion is purely rank-based, so retrieval is currently unobservable: every
-- turn returns the top-N regardless of how poor the match is. This change
-- exposes those already-computed values.
--
-- ADDITIVE / BACKWARD COMPATIBLE: the first two output columns (memory_type,
-- content) keep their position and meaning, the argument signature is unchanged,
-- and ranking behaviour is identical (same RRF weights 0.7 vector / 0.3 text,
-- k=60, same ORDER BY / LIMIT). Only four trailing columns are added. Callers
-- that read memory_type / content (e.g. sexycall's format_memories) are
-- unaffected.
--
-- Why DROP and not a plain CREATE OR REPLACE: adding columns to a RETURNS TABLE
-- changes the function's result type, and PostgreSQL refuses to do that via
-- CREATE OR REPLACE FUNCTION ("cannot change return type of existing function").
-- We therefore DROP and recreate ONLY the function, keyed on its exact argument
-- signature. The agent_memories table and its rows are never touched, and the
-- recreated function keeps the same arguments, so this is not a breaking change.
--
-- Depends on 20260626110000_create_agent_memories.sql, which creates the table
-- and the original two-column function. The DROP is therefore the existing
-- two-column definition.

DROP FUNCTION IF EXISTS public.match_agent_memories_hybrid(
  vector, text, uuid, text, int
);

CREATE OR REPLACE FUNCTION public.match_agent_memories_hybrid(
  query_embedding vector(1536),
  query_text      text,
  p_user_id       uuid,
  p_character_id  text DEFAULT '__shared__',
  match_count     int  DEFAULT 5
)
RETURNS TABLE (
  memory_type     text,
  content         text,
  cosine_distance double precision,  -- m.embedding <=> query_embedding; lower = nearer/better; NULL if no embedding
  rrf_score       double precision,  -- the fused score this row was ranked by
  vector_rank     int,               -- rank in the vector branch (NULL if not matched there)
  text_rank       int                -- rank in the full-text branch (NULL if not matched there)
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, extensions
AS $$
  WITH vector_ranked AS (
    SELECT m.id,
           row_number() OVER (ORDER BY m.embedding <=> query_embedding ASC) AS rank
    FROM public.agent_memories m
    WHERE m.user_id = p_user_id
      AND m.character_id = p_character_id
      AND m.embedding IS NOT NULL
      -- Guard: with a NULL query_embedding, `embedding <=> NULL` is NULL and the
      -- ORDER BY would rank arbitrary rows, polluting the fused result. Returning
      -- 0 rows here lets the hybrid search fall back to pure full-text.
      AND query_embedding IS NOT NULL
    ORDER BY m.embedding <=> query_embedding ASC
    LIMIT least(greatest(match_count, 1) * 4, 50)
  ),
  text_ranked AS (
    SELECT m.id,
           row_number() OVER (
             ORDER BY ts_rank_cd(m.fts, websearch_to_tsquery('simple', query_text)) DESC
           ) AS rank
    FROM public.agent_memories m
    WHERE m.user_id = p_user_id
      AND m.character_id = p_character_id
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
  SELECT m.memory_type,
         m.content,
         -- Recompute the cosine distance for the surviving row. `<=>` yields NULL
         -- when m.embedding is NULL (or query_embedding is NULL), so null-embedding
         -- rows that only matched the text branch report NULL here.
         (m.embedding <=> query_embedding)::double precision AS cosine_distance,
         f.score::double precision                           AS rrf_score,
         f.vector_rank::int                                  AS vector_rank,
         f.text_rank::int                                    AS text_rank
  FROM fused f
  JOIN public.agent_memories m ON m.id = f.id
  ORDER BY f.score DESC
  LIMIT greatest(match_count, 1);
$$;

-- Re-grant: DROP removed the privileges, so restore the original posture.
GRANT EXECUTE ON FUNCTION public.match_agent_memories_hybrid(
  vector, text, uuid, text, int
) TO authenticated, service_role;
