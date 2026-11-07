import type { SupabaseClient } from '@supabase/supabase-js';

export function deleteUserMemories(
  supabase: SupabaseClient<Database>,
  userId: string,
) {
  return supabase
    .from('agent_memories')
    .delete()
    .eq('user_id', userId)
    .select('id');
}
