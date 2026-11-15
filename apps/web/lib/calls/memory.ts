import { logger } from '@sentry/nextjs';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Memory: facts the call agent keeps about a user across calls, in
 * `agent_memories`. The user's preference lives in Auth `user_metadata`
 * under this key; the agent reads the `memory` flag in each call's token.
 */
const PREFERENCE_KEY = 'call_memory_enabled';

/** Memory is on unless the user turned it off. */
export function isCallMemoryEnabled(
  metadata: Record<string, unknown> | null | undefined,
): boolean {
  return metadata?.[PREFERENCE_KEY] !== false;
}

/** The `user_metadata` update that saves the preference. */
export const callMemoryPreference = (enabled: boolean) => ({
  [PREFERENCE_KEY]: enabled,
});

/**
 * The saved preference for a call. It is read from Auth on every call, so
 * JWT metadata, a snapshot, cannot override an opt-out. A failed lookup
 * starts the call without memory.
 */
export async function getCallMemoryPreference(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<boolean> {
  try {
    // biome-ignore lint/plugin/use-verified-claims: Read the saved preference so stale JWT metadata cannot override an opt-out.
    const { data, error } = await supabase.auth.getUser();
    if (error || data?.user?.id !== userId) {
      throw new Error('Memory preference unavailable');
    }
    return isCallMemoryEnabled(data.user.user_metadata);
  } catch {
    logger.warn('Memory preference unavailable; starting call without memory', {
      user: { id: userId },
    });
    return false;
  }
}

/**
 * Erases every memory stored for a user, across all characters. Callers
 * pass the user's cookie client; the owner-only RLS policy and the explicit
 * `user_id` filter both scope it.
 */
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
