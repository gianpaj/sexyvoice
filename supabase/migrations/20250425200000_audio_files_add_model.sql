/*
  # Add model and prediction_id columns to audio_files table

  1. Changes:
    - Add model column as TEXT NOT NULL
    - Add prediction_id column as TEXT that can be NULL
*/

-- Add new columns
ALTER TABLE audio_files
ADD COLUMN model TEXT NOT NULL DEFAULT 'lucataco/orpheus-3b-0.1-ft',  -- Adding default value for existing rows
ADD COLUMN prediction_id TEXT;
-- Remove the default constraint after adding the column
ALTER TABLE audio_files
ALTER COLUMN model DROP DEFAULT;
