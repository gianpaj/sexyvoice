import type { TypedSupabaseClient } from './client';

export function getMyAudioFiles(client: TypedSupabaseClient, userId: string) {
  return client
    .from('audio_files')
    .select(`
      *,
      voices (
        name
      )
    `)
    .eq('user_id', userId)
    .neq('status', 'deleted')
    .order('created_at', { ascending: false });
}
