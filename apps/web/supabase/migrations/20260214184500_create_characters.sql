-- Migration: 20260214184500_create_characters.sql
-- Create characters table for AI character metadata (presentation layer)

CREATE TABLE public.characters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- Link to the prompt content for this character
  prompt_id uuid REFERENCES public.prompts(id) ON DELETE CASCADE NOT NULL,

  -- Link to the voice used by this character
  voice_id uuid REFERENCES public.voices(id) NOT NULL,

  -- Public = predefined presets (Ramona, Lily, etc.), not user-editable
  is_public boolean NOT NULL DEFAULT false,

  -- Character presentation
  name text NOT NULL,
  localized_descriptions jsonb DEFAULT '{}'::jsonb,  -- { "en": "...", "es": "..." }

  -- Session configuration snapshot (model, temperature, maxOutputTokens, grokImageEnabled)
  session_config jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Optional avatar filename
  image text,

  -- Ordering
  sort_order integer NOT NULL DEFAULT 0,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes (including FK indexes per best practices — Postgres does NOT auto-index FKs)
CREATE INDEX characters_user_id_idx ON public.characters (user_id);
CREATE INDEX characters_is_public_idx ON public.characters (is_public);
CREATE INDEX characters_prompt_id_idx ON public.characters (prompt_id);
CREATE INDEX characters_voice_id_idx ON public.characters (voice_id);
CREATE INDEX characters_sort_order_idx ON public.characters (sort_order);

-- RLS
ALTER TABLE public.characters ENABLE ROW LEVEL SECURITY;

-- SELECT: users see their own characters + all public characters
-- NOTE: (select auth.uid()) wrapped in subquery for RLS performance (evaluated once, not per row)
CREATE POLICY "Users can view own and public characters"
  ON public.characters FOR SELECT
  USING ((select auth.uid()) = user_id OR is_public = true);

-- INSERT/UPDATE/DELETE: users can only modify their own non-public characters
CREATE POLICY "Users can insert own characters"
  ON public.characters FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id AND is_public = false);

CREATE POLICY "Users can update own non-public characters"
  ON public.characters FOR UPDATE
  USING ((select auth.uid()) = user_id AND is_public = false);

CREATE POLICY "Users can delete own non-public characters"
  ON public.characters FOR DELETE
  USING ((select auth.uid()) = user_id AND is_public = false);

-- Trigger for updated_at (reuse existing function)
CREATE TRIGGER update_characters_updated_at
  BEFORE UPDATE ON public.characters
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
