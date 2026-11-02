/*
  # Add soft delete functionality to audio_files table

  1. Changes:
    - Add status column as TEXT with default value of 'active'
    - Add deleted_at column as TIMESTAMP WITH TIME ZONE
    - Create index on status for better query performance
*/

-- Add status column with default value
ALTER TABLE audio_files
ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
-- Add deleted_at column (nullable)
ALTER TABLE audio_files
ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE;
-- Create index on status for better query performance
CREATE INDEX idx_audio_files_status ON audio_files(status);
-- Add comment for future reference
COMMENT ON COLUMN audio_files.status IS 'Status of the audio file: active, deleted';
COMMENT ON COLUMN audio_files.deleted_at IS 'Timestamp when the audio file was soft deleted';
