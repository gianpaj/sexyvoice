/*
  # Add credits_used column to audio_files table

  1. Changes:
    - Add credits_used column as INTEGER NOT NULL with default value of 0
*/

-- Add new column with default value
ALTER TABLE audio_files
ADD COLUMN credits_used INTEGER NOT NULL DEFAULT 0;
