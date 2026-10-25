import { captureException } from '@sentry/nextjs';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getCallVoiceSampleKey } from '@/lib/clone/call-voice-sample';
import { getInworldVoiceSample } from '@/lib/clone/inworld';
import { getMistralClient } from '@/lib/clone/mistral';
import { APIErrorResponse } from '@/lib/error-ts';
import { getFileFromR2 } from '@/lib/storage/upload';
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
    if (reference.sample_url) {
      const key = getCallVoiceSampleKey(reference.sample_url, reference.id);
      const audio = await getFileFromR2(key);
      return new NextResponse(new Uint8Array(audio), {
        headers: {
          'Content-Type': 'audio/wav',
          'Cache-Control': 'private, no-store',
        },
      });
    }
    const inworld = reference.provider === 'inworld';
    const audio = inworld
      ? await getInworldVoiceSample(reference.voice_id)
      : Buffer.from(
          await getMistralClient().audio.voices.getSampleAudio({
            voiceId: reference.voice_id,
          }),
          'base64',
        );
    return new NextResponse(new Uint8Array(audio), {
      headers: {
        'Content-Type': inworld ? 'audio/mpeg' : 'audio/wav',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    captureException(error);
    return APIErrorResponse('Voice sample unavailable', 502);
  }
}
