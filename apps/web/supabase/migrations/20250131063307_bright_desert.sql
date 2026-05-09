/*
  # Add total_votes to audio_files table

  1. Changes
    - Add total_votes column to audio_files table with default value of 0

  2. Security
    - No changes to RLS policies needed
*/

-- Add total_votes column
ALTER TABLE audio_files
ADD COLUMN total_votes INTEGER NOT NULL DEFAULT 0;
