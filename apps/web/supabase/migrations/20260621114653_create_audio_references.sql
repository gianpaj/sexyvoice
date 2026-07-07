-- Migration: 20260621114653_create_audio_references.sql
-- Track reusable cloned voices (currently Inworld) so users can re-synthesize
-- with an existing provider voiceId instead of re-cloning from reference audio.

CREATE TABLE public.audio_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- Clone provider that owns the voice (e.g. 'inworld')
  provider text NOT NULL,

  -- External provider voice id (Inworld voiceId) — text, not uuid
  voice_id text NOT NULL UNIQUE,

  -- User-entered display name
  name text NOT NULL,

  -- Clone-time locale/langCode binding for provider-side voices
  locale text NOT NULL,

  -- Whether the voice was created by a paid user (for retention/cleanup policies)
  is_paid boolean NOT NULL DEFAULT false,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes (Postgres does NOT auto-index FKs)
CREATE INDEX audio_references_user_id_idx ON public.audio_references (user_id);

-- RLS
ALTER TABLE public.audio_references ENABLE ROW LEVEL SECURITY;

-- Users can only access their own audio references.
-- NOTE: (select auth.uid()) wrapped in subquery for RLS performance (evaluated once, not per row)
CREATE POLICY "Users can view own audio references"
  ON public.audio_references FOR SELECT
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert own audio references"
  ON public.audio_references FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own audio references"
  ON public.audio_references FOR UPDATE
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete own audio references"
  ON public.audio_references FOR DELETE
  USING ((select auth.uid()) = user_id);

-- Trigger for updated_at (reuse existing function)
CREATE TRIGGER update_audio_references_updated_at
  BEFORE UPDATE ON public.audio_references
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
