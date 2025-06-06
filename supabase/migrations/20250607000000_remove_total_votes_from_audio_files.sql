/*
  # Remove total_votes column from audio_files table

  1. Changes:
    - Drop total_votes column from audio_files table

  2. Security:
    - No changes to RLS policies
*/

ALTER TABLE audio_files
DROP COLUMN IF EXISTS total_votes;
