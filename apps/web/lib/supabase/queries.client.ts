import type { TypedSupabaseClient } from './client';

export type AudioFileAndVoicesRes = Tables<'audio_files'> & {
  voices: Tables<'voices'>;
};

export function getMyActiveAudioFilesFilter(userId: string) {
  return { status: 'active' as const, user_id: userId };
}

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
    .match(getMyActiveAudioFilesFilter(userId))
    .order('created_at', { ascending: false })
    .throwOnError();
}

export function getMyAudioFilesCountQuery(
  client: TypedSupabaseClient,
  userId: string,
) {
  return client
    .from('audio_files')
    .select('id', { count: 'exact', head: true })
    .match(getMyActiveAudioFilesFilter(userId));
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

export async function getMyAudioFilesCount(
  client: TypedSupabaseClient,
  userId: string,
) {
  const { count, error } = await getMyAudioFilesCountQuery(client, userId);
  if (error) throw error;
  return count ?? 0;
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

export function getCreditTransactions(
  client: TypedSupabaseClient,
  userId: string,
) {
  return client
    .from('credit_transactions')
    .select('*')
    .eq('user_id', userId)
    .throwOnError();
}

export async function hasUserPaid(
  client: TypedSupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data, error } = await client
    .from('credit_transactions')
    .select('id')
    .eq('user_id', userId)
    .in('type', ['purchase', 'topup'])
    .limit(1);

  if (error) {
    throw error;
  }

  return (data?.length ?? 0) > 0;
}
