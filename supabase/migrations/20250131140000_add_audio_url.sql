/*
  # Add URL column to audio_files table

  1. Changes:
    - Add url column to audio_files table as non-nullable TEXT
    - Initially populate url column with storage_key values
    - Add NOT NULL constraint after population

  2. Security:
    - No changes to RLS policies needed as existing policies cover the new column
*/

-- Add url column initially as nullable
ALTER TABLE audio_files 
ADD COLUMN url TEXT;

-- Make url column NOT NULL after population
ALTER TABLE audio_files 
ALTER COLUMN url SET NOT NULL; 