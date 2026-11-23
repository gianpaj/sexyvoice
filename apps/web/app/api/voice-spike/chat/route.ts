import { after, NextResponse } from 'next/server';
import { z } from 'zod';

import { APIErrorResponse } from '@/lib/error-ts';
import { getVerifiedClaims } from '@/lib/supabase/auth';
import { createClient } from '@/lib/supabase/server';
import {
  chatEventsResponse,
  chatRunId,
  createChatDb,
  generateChatReply,
  getChatHistory,
  readChat,
  replayChat,
  wireRunId,
} from '@/lib/voice-spike/chat';
import {
  CHAT_ROUTE,
  isLocalSpikeEnvironment,
  isSpikeAllowed,
} from '@/lib/voice-spike/protocol';

export const maxDuration = 80;

const envelope = z.object({
  threadId: z.uuid(),
  runId: wireRunId,
  messages: z.array(z.unknown()).min(1).max(110),
});
const userTurn = z.object({
  role: z.literal('user'),
  content: z.string().trim().min(1).max(2000),
});
const offsetSchema = z
  .string()
  .regex(/^(?:-1|\d{1,4})$/)
  .transform(Number);

async function authorize() {
  const { NODE_ENV, VERCEL_ENV, VOICE_SPIKE_USER_IDS } = process.env;
  if (!(VOICE_SPIKE_USER_IDS && isLocalSpikeEnvironment()))
    return APIErrorResponse('Not found', 404);
  const claims = await getVerifiedClaims(await createClient());
  if (!claims?.sub) return APIErrorResponse('Unauthorized', 401);
  if (!isSpikeAllowed(claims.sub, VOICE_SPIKE_USER_IDS, VERCEL_ENV, NODE_ENV))
    return APIErrorResponse('Not found', 404);
  return claims.sub;
}

export async function POST(request: Request) {
  if (!isLocalSpikeEnvironment()) return APIErrorResponse('Not found', 404);
  const origin = request.headers.get('origin');
  const devOrigin =
    process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_SITE_URL
      ? new URL(process.env.NEXT_PUBLIC_SITE_URL).origin
      : null;
  if (
    !origin ||
    (origin !== new URL(request.url).origin && origin !== devOrigin)
  )
    return APIErrorResponse('Invalid origin', 403);
  const userId = await authorize();
  if (typeof userId !== 'string') return userId;

  const body = await request.text().catch(() => '');
  if (body.length > 512_000)
    return APIErrorResponse('Chat request too large', 413);
  const input = envelope.safeParse(parseJson(body));
  if (!input.success) return APIErrorResponse('Invalid chat request', 400);
  const { threadId, runId, messages } = input.data;
  const turn = userTurn.safeParse(messages.at(-1));
  if (!turn.success) return APIErrorResponse('Invalid chat message', 400);

  try {
    const db = createChatDb();
    const storedId = chatRunId(runId);
    if (!request.headers.has('Last-Event-ID')) {
      if (!process.env.XAI_API_KEY)
        return APIErrorResponse('Chat is unavailable', 503);
      const { data: admitted, error } = await db.rpc('start_voice_spike_chat', {
        p_user_id: userId,
        p_conversation_id: threadId,
        p_run_id: storedId,
        p_text: turn.data.content,
      });
      if (error?.code === '23505')
        return APIErrorResponse('Another call or reply is in progress', 409);
      if (error?.code === 'P0002')
        return APIErrorResponse('Conversation unavailable', 404);
      if (error) throw new Error('Chat admission failed');
      if (admitted) {
        const text = turn.data.content;
        after(() =>
          generateChatReply(
            db,
            { userId, conversationId: threadId, runId: storedId },
            text,
          ),
        );
      }
    }
    return new Response(null, {
      status: 303,
      headers: {
        Location: `${CHAT_ROUTE}?runId=${encodeURIComponent(runId)}`,
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return APIErrorResponse('Could not start the reply', 503);
  }
}

function parseJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const userId = await authorize();
  if (typeof userId !== 'string') return userId;
  const query = new URL(request.url).searchParams;
  try {
    const db = createChatDb();
    if (query.has('threadId')) {
      const thread = z.uuid().safeParse(query.get('threadId'));
      if (!thread.success) return APIErrorResponse('Invalid thread', 400);
      const history = await getChatHistory(db, userId, thread.data);
      return history
        ? NextResponse.json(history, {
            headers: { 'Cache-Control': 'private, no-store' },
          })
        : APIErrorResponse('Conversation unavailable', 404);
    }
    const run = wireRunId.safeParse(query.get('runId'));
    const offset = offsetSchema.safeParse(
      request.headers.get('Last-Event-ID') ?? query.get('offset') ?? '-1',
    );
    if (!(run.success && offset.success))
      return APIErrorResponse('Invalid delivery cursor', 400);
    const storedId = chatRunId(run.data);
    const { data, error } = await readChat(db, userId, storedId);
    if (error) throw new Error('Chat read failed');
    if (!data) return APIErrorResponse('Reply not found', 404);
    const events = replayChat(
      data,
      async () => {
        const snapshot = await readChat(db, userId, storedId);
        if (snapshot.error || !snapshot.data)
          throw new Error('Chat read failed');
        return snapshot.data;
      },
      run.data,
      `chat-assistant:${storedId}`,
      offset.data,
      request.signal,
    );
    return chatEventsResponse(events, request.signal);
  } catch {
    return APIErrorResponse('Chat is unavailable', 503);
  }
}
