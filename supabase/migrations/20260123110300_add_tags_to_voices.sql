-- Add tags column to voices table for searchable voice characteristics
-- Tags are stored as a text array for flexible filtering (e.g., ['intimate', 'romantic', 'calm'])
ALTER TABLE public.voices
ADD COLUMN tags text[] DEFAULT '{}';

-- Add an index on tags for efficient array searches
CREATE INDEX idx_voices_tags ON public.voices USING GIN (tags);

-- Add a comment explaining the column purpose
COMMENT ON COLUMN public.voices.tags IS 'Array of descriptive tags for the voice (e.g., intimate, calm, professional)';
