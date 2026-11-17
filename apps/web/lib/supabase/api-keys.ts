import type { TypedSupabaseClient } from './client';

export function revokeApiKeys(
  client: TypedSupabaseClient,
  userId: string,
  apiKeyId?: string,
) {
  let query = client
    .from('api_keys')
    .update({ is_active: false })
    .eq('user_id', userId);

  if (apiKeyId) {
    query = query.eq('id', apiKeyId);
  }

  return query.select('id');
}
