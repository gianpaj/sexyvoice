/*
  # Drop prediction_id column from voices table

  1. Changes:
    - Drop prediction_id column from voices table as it's no longer needed
*/

ALTER TABLE voices
DROP COLUMN IF EXISTS prediction_id;
