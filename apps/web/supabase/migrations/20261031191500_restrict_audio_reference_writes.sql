-- provider and voice_id name a voice that server code deletes and speaks with
-- the provider's API key. Only the server, which just created that voice, may
-- write rows. Users keep read access and can delete their own rows.
DROP POLICY IF EXISTS "Users can insert own audio references"
  ON public.audio_references;

DROP POLICY IF EXISTS "Users can update own audio references"
  ON public.audio_references;

-- Supabase role defaults differ between hosted projects and rebuilt local
-- databases, so set the privileges explicitly.
GRANT SELECT, DELETE
  ON TABLE public.audio_references
  TO authenticated;

GRANT ALL PRIVILEGES
  ON TABLE public.audio_references
  TO service_role;

REVOKE ALL PRIVILEGES
  ON TABLE public.audio_references
  FROM anon;

REVOKE INSERT, UPDATE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.audio_references
  FROM authenticated;
