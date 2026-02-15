/*
  # Create feedback table

  1. New Table:
    - `feedback` - Stores user feedback messages submitted from the dashboard
      - `id` (uuid, primary key) - Unique identifier
      - `user_id` (uuid, references profiles) - The user who submitted the feedback
      - `type` (text) - Type of feedback: 'feedback', 'idea', or 'issue'
      - `message` (text) - The feedback message content
      - `screenshot_url` (text, nullable) - Optional screenshot URL
      - `language` (text) - The language the user's website is using (en, es, de)
      - `created_at` (timestamptz) - When the feedback was submitted

  2. Security:
    - Enable RLS on `feedback` table
    - Authenticated users can insert their own feedback
    - Authenticated users can view their own feedback
*/

-- create feedback table
create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  type text not null default 'feedback',
  message text not null,
  screenshot_url text,
  language text not null default 'en',
  created_at timestamptz not null default now()
);

-- enable row level security
alter table public.feedback enable row level security;

-- rls policy: authenticated users can insert their own feedback
create policy "authenticated users can insert own feedback"
  on public.feedback
  for insert
  to authenticated
  with check (auth.uid() = user_id);

-- rls policy: authenticated users can view their own feedback
create policy "authenticated users can view own feedback"
  on public.feedback
  for select
  to authenticated
  using (auth.uid() = user_id);

-- indexes for performance
create index idx_feedback_user_id on public.feedback(user_id);
create index idx_feedback_created_at on public.feedback(created_at desc);

-- column comments
comment on table public.feedback is 'User feedback messages submitted from the dashboard';
comment on column public.feedback.type is 'Type of feedback: feedback, idea, or issue';
comment on column public.feedback.language is 'The language locale the user was using when submitting feedback (en, es, de)';
