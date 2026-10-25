import { instrumentSupabaseClient } from '@sentry/nextjs';

export function instrumentSupabase<T>(client: T): T {
  instrumentSupabaseClient(client, { sendOperationData: false });
  return client;
}
