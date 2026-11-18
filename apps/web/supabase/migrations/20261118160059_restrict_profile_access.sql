-- profiles.username contains the Auth email, not a public display name.
-- Correct both fresh bootstrap grants and existing hosted databases.
-- Deploy the service-role Stripe customer lookup and ID writer before applying.
begin;

alter table public.profiles enable row level security;

drop policy if exists "Public profiles are viewable by everyone"
  on public.profiles;
drop policy if exists "Users can view own profile"
  on public.profiles;

create policy "Users can view own profile"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

-- Replace inherited blanket access with explicit privileges. Preserve
-- owner avatar editing, but protect Auth emails and Stripe customer links.
revoke all on table public.profiles from public, anon, authenticated;
-- Signup is handled by the SECURITY DEFINER Auth trigger; restoration uses
-- service_role. Clients must not create profiles with arbitrary email/Stripe IDs.
drop policy if exists "Users can insert their own profile" on public.profiles;
grant select on table public.profiles to authenticated;
grant update (avatar_url) on table public.profiles to authenticated;
grant all on table public.profiles to service_role;

commit;
