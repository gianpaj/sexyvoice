-- profiles.username contains the Auth email, not a public display name.
-- Correct both fresh bootstrap grants and existing hosted databases.
-- Deploy the service-role Stripe customer lookup before applying this migration.
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

-- Replace inherited blanket access with explicit privileges. Preserve the
-- existing owner INSERT/UPDATE policies, but remove RLS-bypassing TRUNCATE.
revoke all on table public.profiles from public, anon, authenticated;
grant select, insert, update on table public.profiles to authenticated;
grant all on table public.profiles to service_role;

commit;
