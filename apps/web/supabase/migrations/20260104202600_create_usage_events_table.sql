-- =============================================================================
-- USAGE EVENTS TABLE
-- =============================================================================
-- Purpose: Immutable audit log for all credit-consuming actions
--
-- DESIGN PRINCIPLES:
-- 1. Append-only: No updates or deletes allowed (enforced via RLS + triggers)
-- 2. Separation of concerns:
--    - usage_events: Records WHY credits were consumed (audit trail)
--    - credit_transactions: Records balance changes (source of truth for balance)
-- 3. Auditability: Every credit deduction can be traced to a specific action
-- 4. User-facing: Enables detailed usage breakdowns in the dashboard
--
-- INVARIANTS:
-- - credits_used is always positive (consumption is positive)
-- - quantity is always positive
-- - source_id references the entity that triggered the usage
-- - Each usage_event should have a corresponding credit_transaction
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ENUM: Usage source types
-- -----------------------------------------------------------------------------
-- Defines the types of actions that consume credits
CREATE TYPE usage_source_type AS ENUM (
  'tts',               -- Text-to-speech audio generation (audio_files)
  'voice_cloning',     -- Voice cloning operation (voices)
  'live_call',         -- Real-time voice call session (call_sessions)
  'audio_processing'   -- Audio enhancement/editing (noise removal, cleanup, etc.)
);

-- -----------------------------------------------------------------------------
-- ENUM: Usage unit types
-- -----------------------------------------------------------------------------
-- Defines the unit of measurement for usage
CREATE TYPE usage_unit_type AS ENUM (
  'chars',             -- TTS: number of characters processed
  'mins',              -- Live calls: call duration in minutes
  'secs',              -- Audio processing: duration in seconds
  'operation'          -- Voice cloning: single operation (fixed cost)
);

-- -----------------------------------------------------------------------------
-- TABLE: usage_events
-- -----------------------------------------------------------------------------
CREATE TABLE usage_events (
  -- Primary key: UUID for global uniqueness and no sequential scanning attacks
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- User reference: Links to auth.users for consistency with credit_transactions
  -- NOT NULL ensures every usage is attributed to a user
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,

  -- Source type: What kind of action consumed credits
  -- Using enum for type safety and query optimization
  source_type usage_source_type NOT NULL,

  -- Source ID: UUID of the entity that triggered this usage
  -- - For tts: audio_files.id
  -- - For voice_cloning: voices.id
  -- - For live_call: call_sessions.id
  -- Nullable to handle edge cases where source might be deleted
  -- We don't use FK here to allow flexibility and prevent cascade issues
  source_id UUID,

  -- Unit: What is being measured (chars, mins, operations)
  unit usage_unit_type NOT NULL,

  -- Quantity: The amount of units consumed
  -- CONSTRAINT: Must be positive (you can't consume negative units)
  quantity NUMERIC(12, 2) NOT NULL CHECK (quantity > 0),

  -- Credits used: The actual credit cost for this usage
  -- CONSTRAINT: Must be positive (consumption is always positive)
  -- Stored separately from quantity because credit rates may vary
  credits_used INTEGER NOT NULL CHECK (credits_used > 0),

  -- Timestamps: When the usage occurred and was recorded
  -- occurred_at: When the action actually happened (may differ from created_at)
  -- created_at: When this record was inserted (immutable)
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Metadata: Flexible JSONB for additional context
  -- Examples:
  --   TTS: { "text_length": 500, "voice_name": "Sarah", "model": "kokoro" }
  --   Voice cloning: { "voice_name": "My Clone", "source_audio_duration": 30 }
  --   Live call: { "model": "gpt-4o-realtime", "ended_reason": "user_disconnect" }
  metadata JSONB DEFAULT '{}'::JSONB
);

-- -----------------------------------------------------------------------------
-- INDEXES: Optimized for common query patterns
-- -----------------------------------------------------------------------------

-- User lookups: Dashboard showing user's usage history
CREATE INDEX usage_events_user_id_idx ON usage_events(user_id);

-- Time-based queries: Usage reports, billing periods, analytics
CREATE INDEX usage_events_occurred_at_idx ON usage_events(occurred_at DESC);
CREATE INDEX usage_events_created_at_idx ON usage_events(created_at DESC);

-- Source type filtering: "Show me all my TTS usage"
CREATE INDEX usage_events_source_type_idx ON usage_events(source_type);

-- Composite index: User's usage by type over time (most common dashboard query)
CREATE INDEX usage_events_user_type_time_idx
  ON usage_events(user_id, source_type, occurred_at DESC);

-- Source ID lookups: "What usage events are linked to this audio file?"
CREATE INDEX usage_events_source_id_idx ON usage_events(source_id)
  WHERE source_id IS NOT NULL;

-- JSONB index: For metadata queries (e.g., filter by model)
CREATE INDEX usage_events_metadata_idx ON usage_events USING gin(metadata);

-- -----------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- -----------------------------------------------------------------------------
ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;

-- Users can only view their own usage events
CREATE POLICY "Users can view own usage events"
  ON usage_events FOR SELECT
  USING (auth.uid() = user_id);

-- Insert is allowed for authenticated users (service role bypasses RLS)
-- In practice, inserts should come from server-side API routes
CREATE POLICY "Service role can insert usage events"
  ON usage_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- NO UPDATE POLICY: Usage events are immutable
-- NO DELETE POLICY: Usage events are never deleted

-- -----------------------------------------------------------------------------
-- IMMUTABILITY ENFORCEMENT
-- -----------------------------------------------------------------------------
-- These triggers prevent any modification to existing records,
-- ensuring the audit trail remains intact even if RLS is bypassed

-- Trigger function: Prevent updates
CREATE OR REPLACE FUNCTION public.prevent_usage_events_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'usage_events table is append-only. Updates are not permitted.';
END;
$$;

-- Trigger function: Prevent deletes
CREATE OR REPLACE FUNCTION public.prevent_usage_events_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'usage_events table is append-only. Deletes are not permitted.';
END;
$$;

-- Apply update prevention trigger
CREATE TRIGGER usage_events_prevent_update
  BEFORE UPDATE ON usage_events
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_usage_events_update();

-- Apply delete prevention trigger
CREATE TRIGGER usage_events_prevent_delete
  BEFORE DELETE ON usage_events
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_usage_events_delete();

-- -----------------------------------------------------------------------------
-- COMMENTS: Documentation for developers
-- -----------------------------------------------------------------------------
COMMENT ON TABLE usage_events IS
  'Immutable audit log for all credit-consuming actions. Append-only by design.';

COMMENT ON COLUMN usage_events.source_type IS
  'Type of action that consumed credits: tts, voice_cloning, or live_call';

COMMENT ON COLUMN usage_events.source_id IS
  'UUID of the source entity (audio_files.id, voices.id, or call_sessions.id)';

COMMENT ON COLUMN usage_events.unit IS
  'Unit of measurement: chars (TTS), mins (calls), secs (audio processing), or operation (cloning)';

COMMENT ON COLUMN usage_events.quantity IS
  'Amount of units consumed (e.g., 500 chars, 3.5 mins)';

COMMENT ON COLUMN usage_events.credits_used IS
  'Actual credit cost - always positive for consumption';

COMMENT ON COLUMN usage_events.occurred_at IS
  'When the usage actually occurred (may differ from record creation time)';

COMMENT ON COLUMN usage_events.metadata IS
  'Additional context as JSONB: model used, voice name, text preview, etc.';

-- =============================================================================
-- EXAMPLE INSERT FLOWS
-- =============================================================================
-- These are reference examples showing how to insert usage events.
-- In production, these would be called from server-side API routes.
-- =============================================================================

/*
-- -----------------------------------------------------------------------------
-- EXAMPLE 1: TTS Generation Usage
-- -----------------------------------------------------------------------------
-- When a user generates audio from text, record the usage event.
-- NOTE: Credit deduction is handled by the reduceCredits() function in the app,
-- which calls the decrement_user_credits RPC. We don't create a credit_transaction
-- record for consumption - only for balance additions (purchase, topup, freemium).

-- The usage_event provides the audit trail for WHY credits were consumed.

-- Insert usage event (audit trail)
INSERT INTO usage_events (
  user_id,
  source_type,
  source_id,
  unit,
  quantity,
  credits_used,
  metadata
) VALUES (
  '123e4567-e89b-12d3-a456-426614174000',  -- user_id
  'tts',                                     -- source_type
  'audio_abc123',                            -- audio_files.id
  'chars',                                   -- unit
  500,                                       -- quantity (characters)
  5,                                         -- credits_used (positive)
  '{
    "text_preview": "Hello, this is a test...",
    "voice_id": "voice_sarah_123",
    "voice_name": "Sarah",
    "model": "kokoro",
    "language": "en"
  }'::jsonb
);

-- -----------------------------------------------------------------------------
-- EXAMPLE 2: Live Voice Call Billing
-- -----------------------------------------------------------------------------
-- When a live call ends, record the usage for the call duration.
-- Live calls may have multiple billing events if billed incrementally.
-- Credit deduction is handled by app logic (reduceCredits function).

-- Insert usage event
INSERT INTO usage_events (
  user_id,
  source_type,
  source_id,
  unit,
  quantity,
  credits_used,
  metadata
) VALUES (
  '123e4567-e89b-12d3-a456-426614174000',
  'live_call',                               -- source_type
  'call_session_def456',                     -- call_sessions.id
  'mins',                                    -- unit
  3.5,                                       -- quantity (minutes, allows decimals)
  15,                                        -- credits_used
  '{
    "model": "gpt-4o-realtime",
    "voice_id": "voice_sarah_123",
    "voice_name": "Sarah",
    "duration_seconds": 210,
    "end_reason": "user_disconnect",
    "transcript_length": 1500
  }'::jsonb
);

-- -----------------------------------------------------------------------------
-- EXAMPLE 3: Voice Cloning Usage
-- -----------------------------------------------------------------------------
-- When a user clones a voice, record the fixed-cost operation.
-- Credit deduction is handled by app logic (reduceCredits function).

-- Insert usage event
INSERT INTO usage_events (
  user_id,
  source_type,
  source_id,
  unit,
  quantity,
  credits_used,
  metadata
) VALUES (
  '123e4567-e89b-12d3-a456-426614174000',
  'voice_cloning',                           -- source_type
  'voice_clone_ghi789',                      -- voices.id (the cloned voice)
  'operation',                               -- unit (fixed cost per operation)
  1,                                         -- quantity (1 operation)
  50,                                        -- credits_used
  '{
    "voice_name": "My Custom Voice",
    "source_audio_duration_seconds": 45,
    "source_audio_url": "r2://uploads/sample.wav",
    "provider": "fal.ai",
    "language": "en"
  }'::jsonb
);

-- -----------------------------------------------------------------------------
-- EXAMPLE 4: Refund Flow
-- -----------------------------------------------------------------------------
-- Refunds are handled ONLY in credit_transactions, NOT in usage_events.
-- Usage events record consumption facts - they are immutable.
-- The refund adds credits back without erasing the usage history.

-- Step 1: Issue refund as a positive credit transaction
INSERT INTO credit_transactions (
  user_id,
  amount,
  type,
  description,
  reference_id,
  metadata
) VALUES (
  '123e4567-e89b-12d3-a456-426614174000',
  50,                                        -- positive amount (refund)
  'refund',                                  -- transaction type
  'Refund: Voice cloning failed',
  'voice_clone_ghi789',                      -- original source that failed
  '{
    "reason": "processing_failed",
    "original_transaction_id": "txn_clone_001",
    "refunded_by": "support_agent_123"
  }'::jsonb
);

-- IMPORTANT: No usage_event is created for refunds!
-- The original usage_event remains intact for audit purposes.
-- The credit balance is restored via the positive credit_transaction.
-- This maintains the invariant that usage_events only records consumption.

-- -----------------------------------------------------------------------------
-- EXAMPLE 5: Audio Processing (Noise Removal, Enhancement)
-- -----------------------------------------------------------------------------
-- When a user processes audio (e.g., removes background noise, enhances quality),
-- record the usage based on audio duration in seconds.

-- Insert usage event
-- Credit deduction is handled by app logic (reduceCredits function).
INSERT INTO usage_events (
  user_id,
  source_type,
  source_id,
  unit,
  quantity,
  credits_used,
  metadata
) VALUES (
  '123e4567-e89b-12d3-a456-426614174000',
  'audio_processing',                        -- source_type
  'processed_audio_jkl012',                  -- output audio_files.id or job ID
  'secs',                                    -- unit (duration-based billing)
  45,                                        -- quantity (seconds of audio processed)
  8,                                         -- credits_used
  '{
    "operation": "noise_removal",
    "input_audio_id": "original_audio_xyz",
    "input_duration_secs": 45,
    "output_format": "wav",
    "provider": "dolby.io",
    "enhancement_level": "high"
  }'::jsonb
);

-- Note: audio_processing can support various operations:
-- - noise_removal: Remove background noise
-- - enhancement: Improve audio quality
-- - normalization: Normalize audio levels
-- - speech_isolation: Isolate speech from music/noise
-- The specific operation is stored in metadata for filtering/reporting.

-- -----------------------------------------------------------------------------
-- QUERY EXAMPLES: User-facing breakdowns
-- -----------------------------------------------------------------------------

-- Get user's total usage by type for the current month
SELECT
  source_type,
  unit,
  SUM(quantity) as total_quantity,
  SUM(credits_used) as total_credits
FROM usage_events
WHERE user_id = '123e4567-e89b-12d3-a456-426614174000'
  AND occurred_at >= date_trunc('month', NOW())
GROUP BY source_type, unit
ORDER BY total_credits DESC;

-- Get user's daily usage breakdown
SELECT
  date_trunc('day', occurred_at) as day,
  source_type,
  COUNT(*) as event_count,
  SUM(credits_used) as credits_used
FROM usage_events
WHERE user_id = '123e4567-e89b-12d3-a456-426614174000'
  AND occurred_at >= NOW() - INTERVAL '30 days'
GROUP BY day, source_type
ORDER BY day DESC;

*/
