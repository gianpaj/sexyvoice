/*
  # Add Performance Indexes

  1. Indexes Created:
    - audio_files(user_id, model) - for isFreemiumUserOverLimit query
    - audio_files(user_id, status, created_at) - for getMyAudioFiles query
    - audio_files(user_id, created_at) - for general user audio queries
    
  2. Benefits:
    - Faster freemium limit checks (avoids full table scan)
    - Faster history page loads (optimized filtering and sorting)
    - Better overall query performance for user-specific audio files
*/

-- Index for isFreemiumUserOverLimit query
-- This supports filtering by user_id and model (especially for LIKE '%gemini%' queries)
CREATE INDEX IF NOT EXISTS idx_audio_files_user_model 
  ON audio_files(user_id, model);

-- Index for getMyAudioFiles query
-- This supports filtering by user_id and status, then sorting by created_at
CREATE INDEX IF NOT EXISTS idx_audio_files_user_status_created 
  ON audio_files(user_id, status, created_at DESC);

-- General index for user audio queries (covers most common access patterns)
CREATE INDEX IF NOT EXISTS idx_audio_files_user_created 
  ON audio_files(user_id, created_at DESC);
