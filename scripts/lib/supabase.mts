import { createClient } from '@supabase/supabase-js';

interface ScriptAdminClientOptions {
  persistSession?: boolean;
}

export function createScriptAdminClient({
  persistSession = false,
}: ScriptAdminClientOptions = {}) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl) {
    throw new Error('Missing env.NEXT_PUBLIC_SUPABASE_URL');
  }
  if (!secretKey) {
    throw new Error('Missing env.SUPABASE_SECRET_KEY');
  }

  return createClient(supabaseUrl, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession,
    },
  });
}
