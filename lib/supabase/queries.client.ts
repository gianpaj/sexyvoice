import type { TypedSupabaseClient } from './client';

// Pagination configuration for audio files
const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 1000;

export function getMyAudioFiles(
  client: TypedSupabaseClient,
  userId: string,
  options?: {
    limit?: number;
    offset?: number;
  },
) {
  const limit = Math.min(options?.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const offset = options?.offset ?? 0;

  return client
    .from('audio_files')
    .select(`
      *,
      voices (
        name
      )
    `)
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
}
