-- Migration: 20260214184400_create_prompts.sql
-- Create prompts table for character prompt content

CREATE TABLE public.prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- Prompt type discriminator using shared enum (extensible: 'call' now, 'tts' future, etc.)
  type public.feature_type NOT NULL,

  -- Whether this prompt is publicly readable (true for predefined character prompts)
  is_public boolean NOT NULL DEFAULT false,

  -- Prompt content
  prompt text NOT NULL DEFAULT '',                 -- English / fallback
  localized_prompts jsonb DEFAULT '{}'::jsonb,     -- { "es": "...", "de": "..." }

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX prompts_user_id_idx ON public.prompts (user_id);
CREATE INDEX prompts_type_idx ON public.prompts (type);
CREATE INDEX prompts_is_public_idx ON public.prompts (is_public);

-- RLS
ALTER TABLE public.prompts ENABLE ROW LEVEL SECURITY;

-- SELECT: users can see their own prompts + all public prompts
-- Public prompts (is_public = true) are readable by anyone (e.g. predefined character prompts).
-- NOTE: (select auth.uid()) is wrapped in a subquery so it is evaluated once per query, not per row.
CREATE POLICY "Users can view own and public prompts"
  ON public.prompts FOR SELECT
  USING ((select auth.uid()) = user_id OR is_public = true);

CREATE POLICY "Users can insert own prompts"
  ON public.prompts FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own prompts"
  ON public.prompts FOR UPDATE
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete own prompts"
  ON public.prompts FOR DELETE
  USING ((select auth.uid()) = user_id);

-- Trigger for updated_at (reuse existing function)
CREATE TRIGGER update_prompts_updated_at
  BEFORE UPDATE ON public.prompts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
