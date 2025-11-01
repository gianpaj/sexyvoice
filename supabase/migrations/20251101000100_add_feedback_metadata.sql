-- Add metadata JSONB column to feedback table
-- Stores browser and device information with feedback submissions

ALTER TABLE feedback ADD COLUMN metadata JSONB DEFAULT '{}'::jsonb;

-- Create GIN index on metadata for efficient querying
CREATE INDEX IF NOT EXISTS idx_feedback_metadata ON feedback USING GIN (metadata);

-- Add comment to document the metadata structure
COMMENT ON COLUMN feedback.metadata IS 'Browser and device metadata: browser info, screen size, language, device type, etc.';
