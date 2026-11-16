import { Buffer } from 'node:buffer';
import { getDeadline, upgradeWebSocket } from '@vercel/functions';
import { connection } from 'next/server';
import type { RawData } from 'ws';

import { APIErrorResponse } from '@/lib/error-ts';
import { getVerifiedClaims } from '@/lib/supabase/auth';
import { createClient } from '@/lib/supabase/server';
import { createVoiceProbe } from '@/lib/voice-spike/probe';
import {
  isSpikeAllowed,
  MAX_BUFFERED_BYTES,
  MAX_FRAME_BYTES,
} from '@/lib/voice-spike/protocol';
import { createProbeProviders } from '@/lib/voice-spike/providers';

export const runtime = 'nodejs';
// Start within the all-plan ceiling. Short leases expose teardown and rotation
// failures cheaply; extending an invocation does not add resumability.
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!process.env.VOICE_SPIKE_USER_IDS)
    return APIErrorResponse('Not found', 404);
  const url = new URL(request.url);
  if (request.headers.get('origin') !== url.origin)
    return APIErrorResponse('Invalid origin', 403);
  if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket')
    return APIErrorResponse('WebSocket required', 426);
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
  const requestedSeconds = Number(url.searchParams.get('leaseSeconds') ?? 60);
  if (
    !Number.isInteger(requestedSeconds) ||
    requestedSeconds < 10 ||
    requestedSeconds > 240
  )
    return APIErrorResponse('Invalid lease', 400);
  const remainingMs =
    (getDeadline()?.getTime() ?? Date.now() + maxDuration * 1000) -
    Date.now() -
    10_000;
  const leaseMs = Math.min(requestedSeconds * 1000, remainingMs);
  if (leaseMs < 1000)
    return APIErrorResponse('Function deadline too close', 503);
  await connection();
  return upgradeWebSocket(
    (socket) =>
      new Promise<void>((resolve) => {
        let probe: ReturnType<typeof createVoiceProbe> | undefined;
        const end = () => {
          probe?.dispose();
          resolve();
        };
        socket.on('close', end);
        socket.on('error', () => {
          socket.close(1011, 'Transport failed');
          end();
        });
        probe = createVoiceProbe({
          leaseMs,
          providers: createProbeProviders(),
          close: (code, reason) => {
            socket.close(code, reason);
            end();
          },
          emit: (event) => {
            if (socket.readyState !== 1) return;
            if (socket.bufferedAmount > MAX_BUFFERED_BYTES) {
              socket.close(1008, 'Client too slow');
              end();
              return;
            }
            socket.send(JSON.stringify(event));
          },
        });
        socket.on('message', (data: RawData, binary: boolean) => {
          const bytes = Array.isArray(data)
            ? Buffer.concat(data)
            : Buffer.from(data as ArrayBuffer);
          probe?.receive(binary ? bytes : bytes.toString('utf8'));
        });
      }),
    { maxPayload: MAX_FRAME_BYTES },
  );
}
