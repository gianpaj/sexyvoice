/*
  # Add usage JSON column to audio_files table

  1. Purpose:
    - Track token usage for AI voice generation requests
    - Store input and output token counts in structured JSON format

  2. Changes:
    - Add usage column as JSONB type to audio_files table
    - Column is nullable to maintain backward compatibility with existing records
    - JSONB format allows efficient querying and indexing of token usage data

  3. Expected JSON structure:
    {
      "inputTokens": <integer>,
      "outputTokens": <integer>
    }
*/

-- Add usage column to store token usage information as JSONB
ALTER TABLE audio_files
ADD COLUMN IF NOT EXISTS usage JSONB;
-- Add comment explaining the column purpose and expected structure
COMMENT ON COLUMN audio_files.usage IS 'JSON object containing token usage information: {"inputTokens": number, "outputTokens": number}';
-- Create index on usage column for efficient querying of token statistics
-- CREATE INDEX idx_audio_files_usage ON audio_files USING GIN (usage);;
