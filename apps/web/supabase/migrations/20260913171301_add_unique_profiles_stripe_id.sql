set search_path = '';

create unique index profiles_stripe_id_unique_idx
  on public.profiles (stripe_id)
  where stripe_id is not null;
