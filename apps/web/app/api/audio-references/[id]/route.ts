import { captureException } from '@sentry/nextjs';
import { NextResponse } from 'next/server';

import { deleteInworldVoice } from '@/lib/clone/inworld';
import { APIErrorResponse } from '@/lib/error-ts';
import {
  deleteAudioReference,
  getAudioReferenceById,
} from '@/lib/supabase/queries';
import { createClient } from '@/lib/supabase/server';

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const [{ id }, supabase] = await Promise.all([
    context.params,
    createClient(),
  ]);

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return APIErrorResponse('Unauthorized', 401);
  }

  const { data: reference, error } = await getAudioReferenceById(id, user.id);

  if (error) {
    console.error(error);
    return APIErrorResponse('Failed to load audio reference', 500);
  }

  if (!reference) {
    return APIErrorResponse('Audio reference not found', 404);
  }

  // Delete the provider-side voice first so we never orphan a remote voice
  // behind a deleted DB row. A 404 from Inworld is treated as already-deleted.
  if (reference.provider === 'inworld') {
    try {
      await deleteInworldVoice(reference.voice_id);
    } catch (deleteError) {
      captureException(deleteError, {
        user: { id: user.id },
        extra: { voiceId: reference.voice_id },
      });
      return APIErrorResponse(
        'Failed to delete the voice from the provider. Please try again.',
        502,
      );
    }
  }

  const { error: deleteRowError } = await deleteAudioReference(id, user.id);

  if (deleteRowError) {
    console.error(deleteRowError);
    return APIErrorResponse('Failed to delete audio reference', 500);
  }

  return NextResponse.json({}, { status: 200 });
}
