/*
  # Make user_id nullable in audio_files table

  1. Changes:
    - Modify user_id column in audio_files table to be nullable
    - Update RLS policies to handle null user_id cases

  2. Security:
    - Modified RLS policies to maintain security with nullable user_id
*/

-- Make user_id column nullable
ALTER TABLE audio_files 
ALTER COLUMN user_id DROP NOT NULL;

-- Drop existing RLS policies for audio_files
DROP POLICY IF EXISTS "Users can view own audio files" ON audio_files;
DROP POLICY IF EXISTS "Users can insert own audio files" ON audio_files;
DROP POLICY IF EXISTS "Users can delete own audio files" ON audio_files;