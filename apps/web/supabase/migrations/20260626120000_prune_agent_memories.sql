-- Migration: 20260626120000_prune_agent_memories.sql
-- Retention: per-scope slot cap for agent_memories.
-- See sexycall docs/plans/memory-retention-slot-cap.md (Part A) and
-- supabase-pgvector-memory.md §15.
--
-- agent_memories already bounds growth via slot-upsert (one row per
-- (user_id, character_id, memory_type)), but the call-end extractor can mint
-- new memory_type labels freely, so a heavy user could still accumulate
-- unboundedly. This caps each (user, character) scope at the N most-recently
-- updated slots and evicts the rest (LRU by updated_at).
--
-- The agent (sexycall, service role) calls this at call-end after the upsert.

-- ---------------------------------------------------------------------------
-- prune_agent_memories_over_cap — keep the newest p_keep slots for one
-- (user, character) scope, delete the rest. Ordering is LRU by updated_at with
-- id as a deterministic tie-break. Returns the number of rows deleted.
-- SECURITY INVOKER: the caller supplies a server-verified user_id (the service
-- role bypasses RLS). Granted to service_role only — browsers never prune.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prune_agent_memories_over_cap(
  p_user_id      uuid,
  p_character_id text DEFAULT '__shared__',
  p_keep         int  DEFAULT 150
)
RETURNS integer
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  WITH ranked AS (
    SELECT id,
           row_number() OVER (ORDER BY updated_at DESC, id DESC) AS rn
    FROM public.agent_memories
    WHERE user_id = p_user_id
      AND character_id = p_character_id
  ),
  deleted AS (
    DELETE FROM public.agent_memories
    WHERE id IN (SELECT id FROM ranked WHERE rn > greatest(p_keep, 0))
    RETURNING 1
  )
  SELECT count(*)::int FROM deleted;
$$;

GRANT EXECUTE ON FUNCTION public.prune_agent_memories_over_cap(uuid, text, int)
  TO service_role;
