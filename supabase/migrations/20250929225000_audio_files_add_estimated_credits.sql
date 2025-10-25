/*
  # Update audio_files table for new credit system

  1. Changes:
    - Add estimated_credits column to track cost calculation
    - Keep credits_used for backward compatibility (will be deprecated later)
    - Add status column for tracking generation status
    - Add indexes for performance

  2. New approach:
    - estimated_credits: Cost calculation for the generation
    - status: pending, processing, completed, failed
    - Credits are deducted via transactions when generation completes
*/

-- Add new columns to audio_files table
ALTER TABLE audio_files 
ADD COLUMN IF NOT EXISTS estimated_credits NUMERIC NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'processing', 'completed', 'failed'));

-- Update existing records to have proper estimated_credits from credits_used
UPDATE audio_files 
SET estimated_credits = COALESCE(credits_used, 0)
WHERE estimated_credits = 0;

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_audio_files_status ON audio_files(status);
CREATE INDEX IF NOT EXISTS idx_audio_files_user_status ON audio_files(user_id, status);

-- Add comments
COMMENT ON COLUMN audio_files.estimated_credits IS 'Estimated cost for this generation (computed before generation)';
COMMENT ON COLUMN audio_files.status IS 'Generation status: pending, processing, completed, failed';