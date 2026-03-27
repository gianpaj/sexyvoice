/*
  # Add metadata JSONB column to audio_files table

  1. Purpose:
    - Store flexible analysis and enrichment metadata for audio files
    - Support fields like detected language without changing the core schema
    - Keep the column nullable for backward compatibility

  2. Changes:
    - Add metadata column as JSONB to audio_files
    - Add a descriptive comment for the column

  3. Example structure:
    {
      "detectedLang": "en"
    }
*/

ALTER TABLE public.audio_files
ADD COLUMN IF NOT EXISTS metadata JSONB;

COMMENT ON COLUMN public.audio_files.metadata IS
  'Flexible JSON metadata for audio files, e.g. {"detectedLang": "en"}';
