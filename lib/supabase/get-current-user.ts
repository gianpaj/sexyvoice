import { createClient } from './server';
import type { SupabaseClient, User } from '@supabase/supabase-js';

export async function getCurrentUser(): Promise<{
  supabase: SupabaseClient;
  user: User | null;
  error: unknown;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  return { supabase, user: data.user ?? null, error };
}
