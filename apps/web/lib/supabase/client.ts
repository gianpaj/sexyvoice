import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

import { instrumentSupabase } from './tracing';

export type TypedSupabaseClient = SupabaseClient<Database>;

let client: TypedSupabaseClient | undefined;

export function getSupabaseBrowserClient() {
  if (client) {
    return client;
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    throw new Error('Missing env.NEXT_PUBLIC_SUPABASE_URL');
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    throw new Error('Missing env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
  }
  client = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      // TanStack Query owns retries for dashboard reads.
      db: { retry: false },
    },
  );
  instrumentSupabase(client);
  return client;
}

function useSupabaseBrowser() {
  return getSupabaseBrowserClient();
}

export default useSupabaseBrowser;
