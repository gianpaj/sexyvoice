-- Find the newest active audio record owned by the user on a cache hit.
create index concurrently idx_audio_files_active_storage_key_user_id_created_at
  on public.audio_files (storage_key, user_id, created_at desc nulls last)
  where status = 'active';
