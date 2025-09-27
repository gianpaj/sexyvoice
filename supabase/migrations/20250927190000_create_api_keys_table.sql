-- Create API keys table
CREATE TABLE public.api_keys (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    key_hash TEXT NOT NULL UNIQUE,
    prefix TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    last_used_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true NOT NULL
);

-- Set up RLS policies
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

-- Users can only see their own API keys
CREATE POLICY "Users can view their own API keys" 
ON public.api_keys 
FOR SELECT 
USING (auth.uid() = user_id);

-- Users can create their own API keys
CREATE POLICY "Users can create their own API keys" 
ON public.api_keys 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Users can update their own API keys
CREATE POLICY "Users can update their own API keys" 
ON public.api_keys 
FOR UPDATE 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Users can delete their own API keys
CREATE POLICY "Users can delete their own API keys" 
ON public.api_keys 
FOR DELETE 
USING (auth.uid() = user_id);

-- Add indexes for performance
CREATE INDEX api_keys_user_id_idx ON public.api_keys(user_id);
CREATE INDEX api_keys_key_hash_idx ON public.api_keys(key_hash);
CREATE INDEX api_keys_prefix_idx ON public.api_keys(prefix);

-- Add api_key_id to audio_files table to track which API key was used
ALTER TABLE public.audio_files ADD COLUMN api_key_id UUID REFERENCES public.api_keys(id) ON DELETE SET NULL;
CREATE INDEX audio_files_api_key_id_idx ON public.audio_files(api_key_id);

-- Update the updated_at timestamp automatically
CREATE OR REPLACE FUNCTION public.handle_api_keys_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$;

CREATE TRIGGER handle_api_keys_updated_at
    BEFORE UPDATE ON public.api_keys
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_api_keys_updated_at();

-- Function to validate API key and get user info
CREATE OR REPLACE FUNCTION public.validate_api_key(api_key_prefix text, api_key_hash text)
RETURNS TABLE(user_id uuid, api_key_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RETURN QUERY
    SELECT ak.user_id, ak.id as api_key_id
    FROM public.api_keys ak
    WHERE ak.prefix = api_key_prefix 
    AND ak.key_hash = api_key_hash 
    AND ak.is_active = true;
    
    -- Update last_used_at
    UPDATE public.api_keys 
    SET last_used_at = timezone('utc'::text, now())
    WHERE prefix = api_key_prefix 
    AND key_hash = api_key_hash 
    AND is_active = true;
END;
$$;