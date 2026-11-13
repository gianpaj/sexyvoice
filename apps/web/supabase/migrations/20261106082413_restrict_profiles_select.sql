-- Restrict profile reads to the profile owner.
--
-- Affected: public.profiles SELECT policies.
--
-- profiles.username holds the user's sign-up email and stripe_id holds their
-- Stripe customer ID. The initial schema let anyone read every row, so the
-- publishable key could list every user's email.
--
-- Server code that reads another user's profile without a session, such as
-- the Stripe webhook resolving a customer ID, uses the service role, which
-- bypasses RLS. Deploy that code before applying this migration.

-- Destructive: removes the policy that made every profile readable by the
-- anon and authenticated roles.
drop policy if exists "Public profiles are viewable by everyone"
  on public.profiles;

drop policy if exists "Users can view own profile"
  on public.profiles;

-- Signed-in users can read only their own profile. anon gets no SELECT
-- policy, so anonymous requests see no rows.
create policy "Users can view own profile"
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);
