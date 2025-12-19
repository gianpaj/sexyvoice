-- Create call_sessions table for tracking voice call duration and billing
CREATE TABLE call_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  room_name TEXT NOT NULL,

  -- Session configuration
  model TEXT NOT NULL,
  voice TEXT NOT NULL,
  temperature FLOAT,
  max_output_tokens INTEGER,
  grok_image_enabled BOOLEAN DEFAULT false,

  -- Timestamps
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_metered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  free_call BOOLEAN DEFAULT false,

  -- Duration tracking
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  billed_minutes INTEGER NOT NULL DEFAULT 0,

  -- Credit tracking
  credits_used INTEGER NOT NULL DEFAULT 0,

  -- Status
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'completed', 'disconnected', 'error'
  end_reason TEXT, -- 'user_disconnect', 'credit_limit', 'duration_limit', 'error', 'agent_unavailable', 'timeout'

  -- Transcript storage (JSONB for incremental saves)
  transcript JSONB DEFAULT '[]'::JSONB,

  -- Metadata
  metadata JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX call_sessions_user_id_idx ON call_sessions(user_id);
CREATE INDEX call_sessions_started_at_idx ON call_sessions(started_at);
CREATE INDEX call_sessions_status_idx ON call_sessions(status);

-- Enable Row Level Security
ALTER TABLE call_sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own call sessions"
  ON call_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own call sessions"
  ON call_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own call sessions"
  ON call_sessions FOR UPDATE
  USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_call_sessions_updated_at
  BEFORE UPDATE ON call_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
