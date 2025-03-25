/*
  # Add model and prediction_id columns to voices table

  1. Changes:
    - Add model column as TEXT NOT NULL
*/

-- Add new columns
ALTER TABLE voices
ADD COLUMN model TEXT NOT NULL DEFAULT 'lucataco/orpheus-3b-0.1-ft';  -- Adding default value for existing rows

-- Remove the default constraint after adding the column
ALTER TABLE voices
ALTER COLUMN model DROP DEFAULT;
