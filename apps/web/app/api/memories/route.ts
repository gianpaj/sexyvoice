import { NextResponse } from 'next/server';

import { deleteUserMemories } from '@/lib/calls/memory';
import { APIErrorResponse } from '@/lib/error-ts';
import { getVerifiedClaims } from '@/lib/supabase/auth';
import { createClient } from '@/lib/supabase/server';

/**
 * DELETE /api/memories: "forget all my memories". Erases every voice-call
 * memory stored for the signed-in user, across all characters.
 */
export async function DELETE() {
  const supabase = await createClient();
  const claims = await getVerifiedClaims(supabase);

  if (!claims?.sub) {
    return APIErrorResponse('Unauthorized', 401);
  }

  const { data, error } = await deleteUserMemories(supabase, claims.sub);

  if (error) {
    return APIErrorResponse('Failed to delete memories', 500);
  }

  return NextResponse.json(
    { deleted: data?.length ?? 0, success: true },
    { status: 200 },
  );
}
