/// <reference path="../../apps/web/lib/supabase/types.d.ts" />

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { printDatabaseTarget, requiredEnv } from './cli.mts';

export type ScriptSupabaseClient = SupabaseClient<Database>;

/**
 * Secret-key Supabase client for operator commands. It names the target
 * database before the first request. A read-only client rejects every request
 * except GET and HEAD before it leaves the process.
 */
export function createScriptAdminClient({
  readOnly = false,
}: {
  readOnly?: boolean;
} = {}): ScriptSupabaseClient {
  const url = requiredEnv('NEXT_PUBLIC_SUPABASE_URL');
  const secretKey = requiredEnv('SUPABASE_SECRET_KEY');
  printDatabaseTarget(url, readOnly);

  return createClient<Database>(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    ...(readOnly && { global: { fetch: createReadOnlyFetch() } }),
  });
}

export function createReadOnlyFetch(
  delegate: typeof fetch = fetch,
): typeof fetch {
  return (input, init) => {
    const requestMethod = input instanceof Request ? input.method : undefined;
    const method = (init?.method ?? requestMethod ?? 'GET').toUpperCase();

    if (method !== 'GET' && method !== 'HEAD') {
      return Promise.reject(
        new Error(`Read-only client blocked HTTP ${method}`),
      );
    }

    return delegate(input, init);
  };
}
