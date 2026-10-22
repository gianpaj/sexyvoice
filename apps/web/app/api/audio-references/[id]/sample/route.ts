import { captureException } from '@sentry/nextjs';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getMistralClient } from '@/lib/clone/mistral';
import { APIErrorResponse } from '@/lib/error-ts';
import { getVerifiedClaims } from '@/lib/supabase/auth';
import { getOwnedCallVoice } from '@/lib/supabase/call-voices';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const claims = await getVerifiedClaims(await createClient());
    if (!claims?.sub) return APIErrorResponse('Unauthorized', 401);
    const { id } = await params;
    if (!z.uuid().safeParse(id).success)
      return APIErrorResponse('Invalid voice ID', 400);
    const reference = await getOwnedCallVoice(id, claims.sub);
    if (!reference) return APIErrorResponse('Voice not found', 404);
    const audio = await getMistralClient().audio.voices.getSampleAudio({
      voiceId: reference.voice_id,
    });
    return new NextResponse(new Uint8Array(Buffer.from(audio, 'base64')), {
      headers: {
        'Content-Type': 'audio/wav',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    captureException(error);
    return APIErrorResponse('Voice sample unavailable', 502);
  }
}
