/*
  # Create audio_votes table

  1. Changes:
    - Add audio_votes table to track user votes on audio files

  2. Security:
    - Enable RLS and allow users to manage their own votes
*/

create table audio_votes (
  id uuid primary key default gen_random_uuid(),
  audio_id uuid references audio_files(id) not null,
  user_id uuid references profiles(id) not null,
  vote integer not null,
  created_at timestamp with time zone default timezone('utc', now()) not null,
  constraint audio_votes_unique unique (audio_id, user_id)
);

alter table audio_votes enable row level security;

create policy "Public can view votes" on audio_votes for select using (true);
create policy "Users can insert votes" on audio_votes for insert with check (auth.uid() = user_id);
create policy "Users can update own votes" on audio_votes for update using (auth.uid() = user_id);
create policy "Users can delete own votes" on audio_votes for delete using (auth.uid() = user_id);

create index audio_votes_audio_id_idx on audio_votes(audio_id);
create index audio_votes_user_id_idx on audio_votes(user_id);
