import { randomUUID } from 'node:crypto';
import { RoomAgentDispatch, RoomConfiguration } from '@livekit/protocol';
import { AGENT_NAME, RUNTIME } from '@sexyvoice/voice-spike';
import { AccessToken } from 'livekit-server-sdk';
import { NextResponse } from 'next/server';

import { APIErrorResponse } from '@/lib/error-ts';
import { getVerifiedClaims } from '@/lib/supabase/auth';
import { createClient } from '@/lib/supabase/server';
import { isSpikeAllowed } from '@/lib/voice-spike/protocol';

export async function POST(request: Request) {
  if (
    !process.env.VOICE_SPIKE_USER_IDS ||
    process.env.VERCEL_ENV === 'production' ||
    (!process.env.VERCEL_ENV && process.env.NODE_ENV !== 'development')
  )
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
  token.roomConfig = new RoomConfiguration({
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
        }),
      }),
    ],
  });
  return NextResponse.json(
    { accessToken: await token.toJwt(), url, runtime: RUNTIME },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
