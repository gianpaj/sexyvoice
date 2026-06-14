set search_path = '';

create index if not exists audio_files_created_at_idx
  on public.audio_files (created_at);

create index if not exists audio_files_model_created_at_idx
  on public.audio_files (model, created_at);
