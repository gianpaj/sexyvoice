-- ============================================================================
-- Migration: Create call_session_analytics tables
-- Description: Stores both individual and aggregated insights from automated
--              call session analysis
-- Used by: scripts/analyze-call-sessions.mjs (runs daily via cron)
-- ============================================================================

-- ============================================================================
-- Table 1: Individual call session analysis results
-- ============================================================================
-- Stores per-session analysis from the LLM, with one row per analyzed call
CREATE TABLE IF NOT EXISTS public.call_session_analysis (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Reference to the original call session
  session_id UUID NOT NULL REFERENCES public.call_sessions(id) ON DELETE CASCADE,

  -- User who made the call
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- When the call started
  started_at TIMESTAMPTZ,

  -- Call duration in seconds
  duration_seconds INTEGER,

  -- How the call ended (user_disconnect, timeout, error, etc.)
  end_reason TEXT,

  -- Primary language detected (ISO 639-1 code: en, es, de, fr, etc.)
  language TEXT,

  -- High-level topic category
  -- Values: roleplay_intimate, roleplay_fantasy, casual_chat, emotional_support,
  --         asmr_relaxation, fetish_content, other
  topic_category TEXT,

  -- More specific topic description
  -- Examples: daddy_dom, girlfriend_experience, meditation, erotic_roleplay, etc.
  topic_subcategory TEXT,

  -- User engagement level during the call
  -- Values: high, medium, low, minimal
  engagement_level TEXT,

  -- Quality of conversation flow
  -- Values: flowing, choppy, one_sided, dying
  conversation_quality TEXT,

  -- Description of what caused disengagement (null if conversation flowed well)
  where_died TEXT,

  -- User's emotional state during the call
  -- Values: satisfied, frustrated, bored, engaged, confused
  user_sentiment TEXT,

  -- Array of main things the user asked for or wanted
  key_requests JSONB DEFAULT '[]'::jsonb,

  -- Any issues with AI responses (too loud, wrong tone, etc.) or null
  ai_issues TEXT,

  -- Any notable patterns or insights about this conversation
  notable_patterns TEXT,

  -- Error message if analysis failed
  error TEXT,

  -- When this analysis was performed
  analyzed_at TIMESTAMPTZ DEFAULT now(),

  -- Record creation timestamp
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for efficient querying
CREATE INDEX idx_call_session_analysis_session_id ON public.call_session_analysis(session_id);
CREATE INDEX idx_call_session_analysis_user_id ON public.call_session_analysis(user_id);
CREATE INDEX idx_call_session_analysis_started_at ON public.call_session_analysis(started_at DESC);
CREATE INDEX idx_call_session_analysis_language ON public.call_session_analysis(language);
CREATE INDEX idx_call_session_analysis_topic_category ON public.call_session_analysis(topic_category);
CREATE INDEX idx_call_session_analysis_engagement_level ON public.call_session_analysis(engagement_level);

-- Enable Row Level Security
ALTER TABLE public.call_session_analysis ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- Table 2: Aggregated daily analysis summaries
-- ============================================================================
-- Stores aggregated insights from each analysis run (typically daily)
CREATE TABLE IF NOT EXISTS public.call_session_analytics (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- When the analysis was performed
  analysis_date TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- How many hours of data were analyzed (typically 24 for daily runs)
  time_range_hours INTEGER NOT NULL,

  -- Number of call sessions that were analyzed in this batch
  total_sessions_analyzed INTEGER NOT NULL,

  -- JSONB containing aggregated insights:
  -- {
  --   "languageDistribution": { "en": 50, "es": 20, ... },
  --   "topicDistribution": { "roleplay_intimate": 30, ... },
  --   "engagementLevels": { "high": 25, "medium": 40, ... },
  --   "durationAnalysis": { "shortCalls": 10, "longCalls": 50, ... },
  --   "timeOfDayAnalysis": { "hourlyDistribution": {...}, "peakHours": [...] },
  --   "conversationDeathAnalysis": { "totalConversationsDied": 15, "reasons": [...] },
  --   "aiComplianceIssues": { "total": 5, "issues": [...] },
  --   "popularTopics": [...],
  --   "topUserRequests": [...]
  -- }
  insights JSONB NOT NULL,

  -- Record creation timestamp
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for efficient querying by analysis date (most recent first)
-- Used when fetching latest analysis results or generating trend reports
CREATE INDEX idx_call_session_analytics_date ON public.call_session_analytics(analysis_date DESC);

-- Enable Row Level Security
-- Note: This table is primarily written by admin scripts and read by internal tools
ALTER TABLE public.call_session_analytics ENABLE ROW LEVEL SECURITY;
