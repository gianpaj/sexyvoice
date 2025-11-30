/*
  # Add provider column to voices table

  1. Add a non-null provider column to the voices table with a default of 'replicate'.
  2. Backfill provider values for existing rows based on model hints.
*/

ALTER TABLE voices
ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'replicate';

UPDATE voices
SET provider = 'google-ai'
WHERE model = 'gpro';

UPDATE voices
SET provider = 'deepinfra'
WHERE model LIKE 'canopylabs/%';

UPDATE voices
SET provider = 'fal.ai'
WHERE model LIKE 'fal-ai/%';

UPDATE voices
SET provider = 'replicate'
WHERE model LIKE 'gianpaj/cog-orpheus-3b-0.1-ft/%';
