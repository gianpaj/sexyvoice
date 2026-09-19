-- Remove the deprecated Grok image flag from call session snapshots.
ALTER TABLE public.call_sessions
DROP COLUMN IF EXISTS grok_image_enabled;
