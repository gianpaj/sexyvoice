-- Create feedback table for storing user feedback and feature requests
-- This table stores feedback submissions from users with status tracking

CREATE TABLE IF NOT EXISTS feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('issue', 'idea')),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'completed', 'rejected')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

-- Create index on user_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_feedback_user_id ON feedback(user_id);

-- Create index on status for filtering
CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status);

-- Create index on created_at for sorting
CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON feedback(created_at DESC);

-- Add RLS policies
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

-- Users can insert their own feedback
CREATE POLICY "Users can insert their own feedback"
  ON feedback
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can view their own feedback
CREATE POLICY "Users can view their own feedback"
  ON feedback
  FOR SELECT
  USING (auth.uid() = user_id);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_feedback_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = TIMEZONE('utc', NOW());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_feedback_updated_at
  BEFORE UPDATE ON feedback
  FOR EACH ROW
  EXECUTE FUNCTION update_feedback_updated_at();
