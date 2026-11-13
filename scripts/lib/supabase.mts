/// <reference path="../../apps/web/lib/supabase/types.d.ts" />

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { printDatabaseTarget, requiredEnv } from './cli.mts';

export type ScriptSupabaseClient = SupabaseClient<Database>;

/** PostgREST returns at most this many rows per request. */
export const PAGE_SIZE = 1000;

export interface QueryResult<Row> {
  data: Row[] | null;
  error: { message: string } | null;
}

/**
 * Read every row a query matches, one page at a time. `page` must order by
 * `id`, limit to PAGE_SIZE and return rows after `afterId`, so concurrent
 * inserts cannot shift a page. An empty page ends the read, so a lower server
 * row cap cannot end it early.
 */
export async function readAllRows<Row extends { id: string }>(
  label: string,
  page: (afterId: string | undefined) => PromiseLike<QueryResult<Row>>,
): Promise<Row[]> {
  const rows: Row[] = [];
  let afterId: string | undefined;
  for (;;) {
    const { data, error } = await page(afterId);
    if (error) {
      throw new Error(`Failed to read ${label}: ${error.message}`);
    }
    if (!data?.length) {
      return rows;
    }
    rows.push(...data);
    afterId = data.at(-1)?.id;
  }
}

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
