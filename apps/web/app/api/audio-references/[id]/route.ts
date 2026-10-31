import { captureException } from '@sentry/nextjs';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { deleteSavedVoice } from '@/lib/clone/delete-saved-voice';
import { APIErrorResponse } from '@/lib/error-ts';
import { getVerifiedClaims } from '@/lib/supabase/auth';
import { getOwnedCallVoice } from '@/lib/supabase/call-voices';
import { createClient } from '@/lib/supabase/server';

/**
 * Deletes a saved voice. Characters that use it keep the ID and show as
 * having no voice until the user picks another.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const claims = await getVerifiedClaims(supabase);
  if (!claims?.sub) return APIErrorResponse('Unauthorized', 401);
  const { id } = await params;
  if (!z.uuid().safeParse(id).success)
    return APIErrorResponse('Invalid voice ID', 400);
  try {
    const reference = await getOwnedCallVoice(id, claims.sub);
    if (!reference) return APIErrorResponse('Voice not found', 404);
    await deleteSavedVoice(supabase, claims.sub, reference);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    captureException(error, {
      extra: { context: 'saved_voice_delete', referenceId: id },
      user: { id: claims.sub },
    });
    return APIErrorResponse('Voice could not be deleted', 502);
  }
}
