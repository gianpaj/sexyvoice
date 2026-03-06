-- Migration: Add foreign key from usage_events.user_id to profiles.id
-- This enables joining usage_events with profiles for username lookup
-- through Supabase's PostgREST API

-- First, drop the existing foreign key constraint to auth.users if it exists
ALTER TABLE public.usage_events
DROP CONSTRAINT IF EXISTS usage_events_user_id_fkey;

-- Add new foreign key constraint to profiles table
ALTER TABLE public.usage_events
ADD CONSTRAINT usage_events_user_id_fkey
FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Add index on user_id for better query performance if it doesn't exist
CREATE INDEX IF NOT EXISTS usage_events_user_id_idx ON public.usage_events(user_id);

-- Add comment to document the change
COMMENT ON CONSTRAINT usage_events_user_id_fkey ON public.usage_events IS
'Foreign key to profiles table for easier querying through PostgREST API';
