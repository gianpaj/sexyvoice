/*
  # Add API key reference to audio_files table

  1. Changes:
    - Add api_key_id column to track which API key was used for generation
    - Column is nullable since existing rows won't have API key reference
    - Add foreign key constraint to api_keys table

  2. Security:
    - No changes to RLS policies needed
    - API key reference is for tracking purposes only
*/

-- Add api_key_id column to audio_files table
ALTER TABLE audio_files
ADD COLUMN api_key_id UUID REFERENCES api_keys(id);

-- Create index for efficient lookups
CREATE INDEX audio_files_api_key_id_idx ON audio_files(api_key_id);

-- Add comment for future reference
COMMENT ON COLUMN audio_files.api_key_id IS 'Reference to the API key used for generation (null for dashboard generations)';