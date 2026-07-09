/*
  # Add is_public column to audio_files table

  1. Changes:
    - Add is_public boolean column to audio_files table
    - Set default value to false
    - Make column NOT NULL

  2. Security:
    - Will need to update RLS policies in a separate migration after this column is added
*/

-- Add is_public column
ALTER TABLE audio_files 
ADD COLUMN is_public BOOLEAN NOT NULL DEFAULT false;
