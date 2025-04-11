/*
  # Add sample_prompt column to voices table

  1. Changes:
    - Add sample_prompt column as TEXT that can be NULL
    - This stores a reference prompt text used to generate the voice sample
*/

-- Add the sample_prompt column
ALTER TABLE voices
ADD COLUMN sample_prompt TEXT;
