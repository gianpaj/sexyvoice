import type { SupabaseClient } from '@supabase/supabase-js';

export const getVerifiedClaims = async (supabase: SupabaseClient<Database>) => {
  const { data, error } = await supabase.auth.getClaims();

  if (error) {
    return null;
  }

  return data?.claims ?? null;
};
