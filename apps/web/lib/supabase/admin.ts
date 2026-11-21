import { createClient } from '@supabase/supabase-js';

import { instrumentSupabase } from './tracing';

export function createAdminClient() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    throw new Error('Missing env.NEXT_PUBLIC_SUPABASE_URL');
  }
  if (!process.env.SUPABASE_SECRET_KEY) {
    throw new Error('Missing env.SUPABASE_SECRET_KEY');
  }
  const client = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SECRET_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
  return instrumentSupabase(client);
}
