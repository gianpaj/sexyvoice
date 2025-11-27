import type { TypedSupabaseClient } from './client';

export type AudioFileAndVoicesRes = AudioFile & { voices: Voice };

export function getMyAudioFilesQuery(
  client: TypedSupabaseClient,
  userId: string,
) {
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
    .throwOnError();
}

// For client-side useQuery
export async function getMyAudioFiles(
  client: TypedSupabaseClient,
  userId: string,
) {
  const { data, error } = await getMyAudioFilesQuery(client, userId);
  if (error) throw error;
  return data;
}

// For server-side prefetching with supabase-cache-helpers
export function getCreditsQuery(client: TypedSupabaseClient, userId: string) {
  return client
    .from('credits')
    .select('amount')
    .eq('user_id', userId)
    .throwOnError()
    .single();
}

// For client-side useQuery
export async function getCredits(client: TypedSupabaseClient, userId: string) {
  const { data, error } = await getCreditsQuery(client, userId);
  if (error) throw error;
  return data;
}
