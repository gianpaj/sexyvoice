import { NextResponse } from 'next/server';

import { APIErrorResponse } from '@/lib/error-ts';
import { createClient } from '@/lib/supabase/server';

/**
 * DELETE /api/memories — "forget all my memories".
 *
 * Erases every long-term voice-call memory stored for the authenticated user
 * (data-subject erasure). Per-user only for now: this wipes the user's whole
 * bucket across all characters; per-character selective deletion is deferred.
 *
 * Uses the cookie-authenticated client and relies on the agent_memories
 * owner-only RLS DELETE policy; the explicit user_id filter is belt-and-braces.
 */
export async function DELETE() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return APIErrorResponse('Unauthorized', 401);
  }

  const { data, error } = await supabase
    .from('agent_memories')
    .delete()
    .eq('user_id', user.id)
    .select('id');

  if (error) {
    return APIErrorResponse('Failed to delete memories', 500);
  }

  return NextResponse.json(
    { success: true, deleted: data?.length ?? 0 },
    { status: 200 },
  );
}
