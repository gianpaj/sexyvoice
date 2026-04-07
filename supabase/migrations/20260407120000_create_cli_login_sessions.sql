create table if not exists public.cli_login_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  old_api_key_id uuid references public.api_keys(id) on delete set null,
  new_api_key_id uuid not null references public.api_keys(id) on delete cascade,
  token_hash text not null unique,
  encrypted_api_key text,
  callback_url text not null,
  state text not null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  expires_at timestamptz not null,
  redeemed_at timestamptz
);

create index if not exists cli_login_sessions_user_id_idx
  on public.cli_login_sessions (user_id);

create index if not exists cli_login_sessions_expires_at_idx
  on public.cli_login_sessions (expires_at);

-- RLS enabled with no policies: all access must go through the admin/service-role client
alter table public.cli_login_sessions enable row level security;
