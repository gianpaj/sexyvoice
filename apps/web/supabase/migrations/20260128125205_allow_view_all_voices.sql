-- Migration: allow_view_all_voices
-- Purpose: Update the voices RLS policy to allow authenticated users to view all voices,
--          regardless of public/private status or ownership.
-- Affected table: voices
-- Affected policy: "Users can view public voices"
-- Reason: Users need to be able to browse and select from all available voices in the system,
--         including private voices created by other users.

-- Drop the existing restrictive policy that only allows viewing public voices or own voices
drop policy if exists "Users can view public voices" on voices;

-- Drop the insert policy for user-owned voices
-- This policy is no longer needed as voices are managed differently
drop policy if exists "Users can insert own voices" on voices;

-- Create new policy allowing authenticated users to view all voices
-- This enables users to browse the full voice library for selection
create policy "Authenticated users can view all voices"
  on voices for select
  to authenticated
  using (true);

-- Create policy for anonymous users to view only public voices
-- Anonymous users should still be restricted to public voices only
create policy "Anonymous users can view public voices"
  on voices for select
  to anon
  using (is_public = true);
