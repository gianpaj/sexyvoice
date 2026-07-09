create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  key_hash text not null unique,
  key_prefix varchar(12) not null,
  name text not null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  last_used_at timestamptz,
  expires_at timestamptz,
  is_active boolean not null default true,
  permissions jsonb not null default '{"scopes":["voice:generate"]}'::jsonb,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists api_keys_user_id_idx on public.api_keys (user_id);
create index if not exists api_keys_key_prefix_idx on public.api_keys (key_prefix);
create index if not exists api_keys_is_active_idx on public.api_keys (is_active);

alter table public.api_keys enable row level security;

create policy "Users can select own api keys"
on public.api_keys
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can insert own api keys"
on public.api_keys
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update own api keys"
on public.api_keys
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete own api keys"
on public.api_keys
for delete
to authenticated
using (auth.uid() = user_id);

create or replace function public.update_api_key_last_used(p_key_hash text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.api_keys
  set last_used_at = timezone('utc'::text, now())
  where key_hash = p_key_hash
    and is_active = true
    and (expires_at is null or expires_at > timezone('utc'::text, now()));
end;
$$;

revoke all on function public.update_api_key_last_used(text) from public;
grant execute on function public.update_api_key_last_used(text) to service_role;
