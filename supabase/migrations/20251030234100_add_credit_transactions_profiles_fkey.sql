-- Migration: Add foreign key from credit_transactions.user_id to profiles.id
-- This changes the reference from auth.users to profiles table for better data consistency
-- and easier querying through Supabase's PostgREST API

-- First, drop the existing foreign key constraint to auth.users
ALTER TABLE public.credit_transactions
DROP CONSTRAINT IF EXISTS credit_transactions_user_id_fkey;

-- Add new foreign key constraint to profiles table
ALTER TABLE public.credit_transactions
ADD CONSTRAINT credit_transactions_user_id_fkey
FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Add index on user_id for better query performance if it doesn't exist
CREATE INDEX IF NOT EXISTS credit_transactions_user_id_idx ON public.credit_transactions(user_id);

-- Add comment to document the change
COMMENT ON CONSTRAINT credit_transactions_user_id_fkey ON public.credit_transactions IS
'Foreign key to profiles table for easier querying through PostgREST API';
