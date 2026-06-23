-- Migration: 20260623120000_create_agent_memories.sql
-- Long-term voice-agent memory backed by pgvector (replaces hosted mem0).
-- See sexycall docs/plans/supabase-pgvector-memory.md.
--
-- The agent (sexycall) writes/reads with the service-role key, which bypasses
-- RLS, and always passes a server-verified user_id. RLS below only governs the
-- browser/`authenticated` role for a future "what do you remember about me" UI.
--
-- IMPORTANT: vector(1536) must match sexycall's EMBEDDING_DIM
-- (OpenAI text-embedding-3-small = 1536). Changing the embedding model means a
-- re-embed migration, since the column dimension is fixed here.

-- pgvector lives in the `extensions` schema on Supabase (in the DB search_path).
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- agent_memories — per-user (optionally per-character) memory slots.
-- One slot per (user_id, character_id, memory_type); the call-end extractor
-- upserts on that key so re-mentions replace in place rather than duplicate.
-- character_id is text (not an FK) so it can hold either a character UUID or
-- the '__shared__' sentinel used for user-scoped (cross-character) memories.
-- ---------------------------------------------------------------------------
CREATE TABLE public.agent_memories (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  character_id text NOT NULL DEFAULT '__shared__',  -- '__shared__' = user scope
  memory_type  text NOT NULL,                        -- snake_case label, e.g. 'preferred_name'
  content      text NOT NULL,
  embedding    vector(1536),                          -- must match EMBEDDING_DIM
  fts          tsvector GENERATED ALWAYS AS (
                 to_tsvector(
                   'simple',  -- language-agnostic (sexycall is multilingual)
                   coalesce(memory_type, '') || ' ' || coalesce(content, '')
                 )
               ) STORED,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, character_id, memory_type)
);

-- Indexes. The UNIQUE constraint already covers (user_id, character_id, ...),
-- so a plain user_id index is redundant; add ANN + FTS indexes for retrieval.
CREATE INDEX agent_memories_embedding_hnsw
  ON public.agent_memories USING hnsw (embedding vector_cosine_ops);
CREATE INDEX agent_memories_fts_gin
  ON public.agent_memories USING gin (fts);

-- RLS — owner-only. No INSERT/UPDATE policy: only the service role writes.
ALTER TABLE public.agent_memories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own memories"
  ON public.agent_memories FOR SELECT
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete own memories"
  ON public.agent_memories FOR DELETE
  USING ((select auth.uid()) = user_id);

-- updated_at maintenance (reuse existing shared trigger function).
CREATE TRIGGER update_agent_memories_updated_at
  BEFORE UPDATE ON public.agent_memories
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- match_agent_memories_hybrid — hybrid retrieval for one (user, character)
-- scope via Reciprocal Rank Fusion (RRF, k=60) of a pgvector cosine branch and
-- a full-text branch, weighted 0.7 vector / 0.3 text. SECURITY INVOKER: the
-- caller (agent, service role) supplies a server-verified user_id.
-- search_path includes `extensions` so the vector type / `<=>` operator resolve.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.match_agent_memories_hybrid(
  query_embedding vector(1536),
  query_text      text,
  p_user_id       uuid,
  p_character_id  text DEFAULT '__shared__',
  match_count     int  DEFAULT 5
)
RETURNS TABLE (memory_type text, content text)
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
           coalesce(0.7 / (60 + v.rank), 0.0)
             + coalesce(0.3 / (60 + t.rank), 0.0) AS score
    FROM vector_ranked v
    FULL OUTER JOIN text_ranked t ON v.id = t.id
  )
  SELECT m.memory_type, m.content
  FROM fused f
  JOIN public.agent_memories m ON m.id = f.id
  ORDER BY f.score DESC
  LIMIT greatest(match_count, 1);
$$;

GRANT EXECUTE ON FUNCTION public.match_agent_memories_hybrid(
  vector, text, uuid, text, int
) TO authenticated, service_role;
