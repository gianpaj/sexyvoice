-- Create API keys table for external API access
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  key_hash VARCHAR(64) NOT NULL UNIQUE, -- SHA-256 hash of the API key
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_used_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT TRUE
);

-- Add index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(is_active);

-- Add RLS policies
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

-- Users can only see their own API keys
CREATE POLICY "Users can view own api_keys" ON api_keys
  FOR SELECT USING (user_id = auth.uid());

-- Users can only create their own API keys
CREATE POLICY "Users can create own api_keys" ON api_keys
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Users can only update their own API keys
CREATE POLICY "Users can update own api_keys" ON api_keys
  FOR UPDATE USING (user_id = auth.uid());

-- Users can only delete their own API keys
CREATE POLICY "Users can delete own api_keys" ON api_keys
  FOR DELETE USING (user_id = auth.uid());

-- Add api_key_id column to audio_files table to track which API key was used
ALTER TABLE audio_files ADD COLUMN IF NOT EXISTS api_key_id UUID REFERENCES api_keys(id) ON DELETE SET NULL;

-- Add index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_audio_files_api_key_id ON audio_files(api_key_id);