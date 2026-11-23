import { randomUUID } from 'node:crypto';
import { RoomAgentDispatch, RoomConfiguration } from '@livekit/protocol';
import { AGENT_NAME, RUNTIME } from '@sexyvoice/voice-spike';
import { loadThreadCharacter } from '@sexyvoice/voice-spike/history';
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { APIErrorResponse } from '@/lib/error-ts';
import { getVerifiedClaims } from '@/lib/supabase/auth';
import { getOwnedCallVoice } from '@/lib/supabase/call-voices';
import { hasUserPaid } from '@/lib/supabase/queries';
import { createClient } from '@/lib/supabase/server';
import { spikeCharacterVoiceReference } from '@/lib/voice-spike/characters';
import { createChatDb } from '@/lib/voice-spike/chat';
import {
  isLocalSpikeEnvironment,
  isSpikeAllowed,
} from '@/lib/voice-spike/protocol';

const requestSchema = z.strictObject({
  audioReferenceId: z.uuid().optional(),
  conversationId: z.uuid().optional(),
});

export async function POST(request: Request) {
  if (!(process.env.VOICE_SPIKE_USER_IDS && isLocalSpikeEnvironment()))
    return APIErrorResponse('Not found', 404);
  const origin = request.headers.get('origin');
  const developmentOrigin =
    process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_SITE_URL
      ? new URL(process.env.NEXT_PUBLIC_SITE_URL).origin
      : null;
  if (
    origin !== new URL(request.url).origin &&
    (!developmentOrigin || origin !== developmentOrigin)
  )
    return APIErrorResponse('Invalid origin', 403);
  const supabase = await createClient();
  const claims = await getVerifiedClaims(supabase);
  if (!claims?.sub) return APIErrorResponse('Unauthorized', 401);
  if (
    !isSpikeAllowed(
      claims.sub,
      process.env.VOICE_SPIKE_USER_IDS,
      process.env.VERCEL_ENV,
      process.env.NODE_ENV,
    )
  )
    return APIErrorResponse('Not found', 404);
  const {
    LIVEKIT_API_KEY: apiKey,
    LIVEKIT_API_SECRET: apiSecret,
    LIVEKIT_URL: url,
  } = process.env;
  if (!(apiKey && apiSecret && url))
    return APIErrorResponse('LiveKit is not configured', 503);
  const body = await request
    .text()
    .then((text) => (text === '' ? {} : JSON.parse(text)))
    .catch(() => null);
  const selection = requestSchema.safeParse(body);
  if (!selection.success)
    return APIErrorResponse('Invalid call selection', 400);

  const resumeId = selection.data.conversationId;
  let audioReferenceId = selection.data.audioReferenceId;
  if (resumeId) {
    const { data, error } = await supabase
      .from('conversations')
      .select('id,character_id,is_voice_spike,language')
      .eq('id', resumeId)
      .eq('user_id', claims.sub)
      .maybeSingle();
    if (error) return APIErrorResponse('Conversation lookup unavailable', 503);
    if (!(data && (data.is_voice_spike || data.character_id)))
      return APIErrorResponse('Conversation not found', 404);
    if (data.character_id) {
      try {
        const character = await loadThreadCharacter(
          createChatDb(),
          claims.sub,
          data.character_id,
          data.language,
        );
        if (!character) return APIErrorResponse('Character not found', 404);
        if (!character.isPublic) {
          if (!(await hasUserPaid(claims.sub)))
            return APIErrorResponse(
              'Custom characters require a paid account',
              403,
            );
          if (audioReferenceId)
            return APIErrorResponse('The character supplies the voice', 400);
          audioReferenceId = spikeCharacterVoiceReference(
            character.sessionConfig,
          );
          if (!audioReferenceId)
            return APIErrorResponse('Voice not found', 404);
        }
      } catch {
        return APIErrorResponse('Character lookup unavailable', 503);
      }
    }
  }
  const conversationId = resumeId ?? randomUUID();

  let inworldVoiceId: string | undefined;
  if (audioReferenceId) {
    try {
      const reference = await getOwnedCallVoice(
        audioReferenceId,
        claims.sub,
        'inworld',
      );
      inworldVoiceId = reference?.voice_id?.trim();
      if (!inworldVoiceId) return APIErrorResponse('Voice not found', 404);
    } catch {
      return APIErrorResponse('Voice lookup unavailable', 503);
    }
  }

  const roomName = `js-spike-${randomUUID()}`;
  const token = new AccessToken(apiKey, apiSecret, {
    identity: `spike-user-${claims.sub}`,
    ttl: 600,
  });
  token.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    canUpdateOwnMetadata: false,
  });
  const roomConfig = {
    name: roomName,
    emptyTimeout: 30,
    maxParticipants: 2,
    agents: [
      new RoomAgentDispatch({
        agentName: AGENT_NAME,
        metadata: JSON.stringify({
          runtime: RUNTIME,
          userId: claims.sub,
          expiresAt: Date.now() + 120_000,
          conversationId,
          resume: resumeId !== undefined,
          inworldVoiceId,
        }),
      }),
    ],
  };
  if (inworldVoiceId) {
    // The join token is readable by the browser. Keep the provider ID in the server dispatch.
    try {
      await new RoomServiceClient(url, apiKey, apiSecret, {
        requestTimeout: 5,
      }).createRoom(roomConfig);
    } catch {
      return APIErrorResponse('LiveKit room unavailable', 503);
    }
  } else {
    token.roomConfig = new RoomConfiguration(roomConfig);
  }

  return NextResponse.json(
    { accessToken: await token.toJwt(), url, runtime: RUNTIME, conversationId },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
