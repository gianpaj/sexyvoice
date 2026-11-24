-- Local catalog data loaded by `supabase db reset --local` (see
-- [db.seed] in config.toml). Production holds these rows already.

-- Users: a loginless owner for catalog voices, plus a paid and a freemium
-- test user who sign in with the password `password`. The
-- new_user_trigger gives each a profile and 10k freemium credits.
-- Empty token columns keep GoTrue from failing on NULL strings.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select
  id::uuid, '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', email,
  case when can_log_in
    then extensions.crypt('password', extensions.gen_salt('bf')) end,
  now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(),
  '', '', '', ''
from (values
  ('00000000-0000-4000-a000-000000000001', 'catalog@sexyvoice.local', false),
  ('00000000-0000-4000-a000-000000000002', 'gianpa@test.com', true),
  ('00000000-0000-4000-a000-000000000003', 'gianpa.spain@test.com', true)
) as seed_users (id, email, can_log_in)
on conflict (id) do nothing;

insert into auth.identities
  (provider_id, user_id, identity_data, provider, created_at, updated_at)
select
  u.id::text, u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email', now(), now()
from auth.users u
where u.email in ('gianpa@test.com', 'gianpa.spain@test.com')
on conflict (provider_id, provider) do nothing;

-- A top-up makes gianpa@test.com a paid user (see hasUserPaid). The fixed
-- reference_id keeps reruns from adding credits twice.
with topup as (
  insert into public.credit_transactions
    (user_id, amount, type, description, reference_id, metadata)
  values (
    '00000000-0000-4000-a000-000000000002',
    25000,
    'topup',
    'Credit top-up - $10',
    'pi_local_seed_topup',
    '{"dollarAmount": 10, "isFirstTopup": true, "packageId": "standard"}'
  )
  on conflict (reference_id) where type = 'topup' and reference_id is not null
  do nothing
  returning user_id, amount
)
update public.credits c
set amount = c.amount + topup.amount, updated_at = now()
from topup
where c.user_id = topup.user_id;

-- Built-in Grok call voices.
insert into public.voices
  (id, user_id, name, language, model, feature, is_public, type, description, sort_order)
values
  ('00000000-0000-4000-a000-000000000301', '00000000-0000-4000-a000-000000000001',
   'Ara', 'multiple', 'xai', 'call', true, 'Female',
   'Default voice, balanced and conversational', 0),
  ('00000000-0000-4000-a000-000000000302', '00000000-0000-4000-a000-000000000001',
   'Rex', 'multiple', 'xai', 'call', true, 'Male',
   'Professional and articulate, ideal for business applications', 1),
  ('00000000-0000-4000-a000-000000000303', '00000000-0000-4000-a000-000000000001',
   'Sal', 'multiple', 'xai', 'call', true, 'Neutral',
   'Versatile voice suitable for various contexts', 2),
  ('00000000-0000-4000-a000-000000000304', '00000000-0000-4000-a000-000000000001',
   'Eve', 'multiple', 'xai', 'call', true, 'Female',
   'Engaging and enthusiastic, great for interactive experiences', 3),
  ('00000000-0000-4000-a000-000000000305', '00000000-0000-4000-a000-000000000001',
   'Leo', 'multiple', 'xai', 'call', true, 'Male',
   'Decisive and commanding, suitable for instructional content', 4)
on conflict (id) do nothing;

-- Shared row that characters and call sessions with a saved voice point
-- to (CLONED_VOICE_ID in lib/call-voices.ts). Not public, so it stays out
-- of the voice picker.
insert into public.voices
  (id, user_id, name, language, model, feature, is_public)
values
  ('420c4014-7d6d-44ef-b87d-962a3124a170', '00000000-0000-4000-a000-000000000001',
   'Saved voice', 'multiple', 'inworld-tts', 'call', false)
on conflict (id) do nothing;
