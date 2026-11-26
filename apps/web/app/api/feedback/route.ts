import { logger } from '@sentry/nextjs';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { APIErrorResponse } from '@/lib/error-ts';
import {
  CALL_FEEDBACK_REASONS,
  FEEDBACK_NOTE_MAX_LENGTH,
} from '@/lib/feedback';
import { createAdminClient } from '@/lib/supabase/admin';
import { getVerifiedClaims } from '@/lib/supabase/auth';
import { createClient } from '@/lib/supabase/server';

const submissionSchema = z
  .strictObject({
    note: z.string().trim().max(FEEDBACK_NOTE_MAX_LENGTH).optional(),
    rating: z.enum(['up', 'down']),
    reasonCode: z.enum(CALL_FEEDBACK_REASONS).optional(),
    target: z.discriminatedUnion('kind', [
      z.strictObject({
        kind: z.literal('call'),
        roomName: z.string().startsWith('voice-chat-').max(128),
      }),
      z.strictObject({ audioFileId: z.uuid(), kind: z.literal('audio') }),
    ]),
  })
  .refine(({ note, rating, reasonCode, target }) => {
    const needsReason = target.kind === 'call' && rating === 'down';
    return needsReason
      ? Boolean(reasonCode) && (!note || reasonCode === 'other')
      : !(reasonCode || note);
  });

export async function POST(request: Request) {
  const claims = await getVerifiedClaims(await createClient());
  if (!claims?.sub) return APIErrorResponse('Unauthorized', 401);
  if (
    request.headers.get('content-type')?.split(';')[0] !== 'application/json'
  ) {
    return APIErrorResponse('Expected a JSON request', 415);
  }

  const submission = submissionSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!submission.success) return APIErrorResponse('Invalid feedback', 400);

  const { note, rating, reasonCode, target } = submission.data;
  const { data, error } = await createAdminClient().rpc('save_feedback', {
    ...(target.kind === 'call'
      ? { p_call_room_name: target.roomName }
      : { p_audio_file_id: target.audioFileId }),
    ...(reasonCode && { p_reason_code: reasonCode }),
    ...(note && { p_note: note }),
    p_rating: rating,
    p_user_id: claims.sub,
  });

  if (error?.code === 'P0002') {
    return APIErrorResponse('Feedback target unavailable', 404);
  }
  if (error?.code === '55000') {
    return APIErrorResponse('Call is still ending', 409);
  }
  if (error) {
    logger.error('Feedback save failed', { code: error.code });
    return APIErrorResponse('Could not save feedback', 503);
  }

  return NextResponse.json({ rating: data });
}
