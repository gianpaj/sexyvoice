import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import {
  boundedHistory,
  HISTORY_ROWS,
  historySchema,
  replyInstructions,
  threadSchema,
} from '@sexyvoice/voice-spike/history';
import { loadMemory } from '@sexyvoice/voice-spike/memory';
import { streamReply } from '@sexyvoice/voice-spike/reply';
import { createClient } from '@supabase/supabase-js';
import { EventType, type StreamChunk } from '@tanstack/ai';
import type { UIMessage } from '@tanstack/ai-react';
import { z } from 'zod';

const READ_TIMEOUT_MS = 4000;
const REPLY_MAX_CHARS = 8000;
export const wireRunId = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
const uuid = z.uuid();

export function chatRunId(id: string) {
  if (uuid.safeParse(id).success) return id;
  const hash = createHash('sha256')
    .update('voice-spike-chat:')
    .update(id)
    .digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

export function createChatDb() {
  const url = new URL(
    process.env.VOICE_SPIKE_LOCAL_SUPABASE_URL ??
      process.env.NEXT_PUBLIC_SUPABASE_URL ??
      '',
  );
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!(key && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
    throw new Error('The internal chat requires local Supabase');
  return createClient<Database>(url.href, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      fetch: (request, init) =>
        fetch(request, {
          ...init,
          signal: init?.signal ?? AbortSignal.timeout(READ_TIMEOUT_MS),
        }),
    },
  });
}

type Db = ReturnType<typeof createChatDb>;
interface ChatKey {
  conversationId: string;
  runId: string;
  userId: string;
}

export async function generateChatReply(
  db: Db,
  { userId, conversationId, runId }: ChatKey,
  text: string,
) {
  const abortController = new AbortController();
  const timer = globalThis.setTimeout(() => abortController.abort(), 55_000);
  let reply = '';
  let status: 'completed' | 'interrupted' = 'interrupted';
  let usage: Json = null;
  const save = async (state: 'streaming' | typeof status) => {
    const { data, error } = await db.rpc('save_voice_spike_chat', {
      p_user_id: userId,
      p_run_id: runId,
      p_status: state,
      p_text: reply,
      p_usage: usage,
    });
    if (error) throw new Error('Could not save chat progress');
    return data;
  };
  try {
    const [thread, history] = await Promise.all([
      db
        .from('conversations')
        .select(
          'character_id,character_name,is_voice_spike,language,scene_instructions',
        )
        .eq('user_id', userId)
        .eq('id', conversationId)
        .single(),
      db
        .from('conversation_messages')
        .select('id,role,parts,status')
        .eq('conversation_id', conversationId)
        .in('status', ['completed', 'interrupted'])
        .order('position', { ascending: false })
        .limit(HISTORY_ROWS),
    ]);
    if (thread.error || history.error)
      throw new Error('Could not load chat context');
    const config = threadSchema.parse(thread.data);
    const memory = await loadMemory(db, userId, config.character_id);
    const recalled = await memory?.recall?.(text);
    const turns = boundedHistory(historySchema.parse(history.data));
    const systemPrompts = replyInstructions(
      config,
      memory?.instructions,
      recalled,
    );
    let lastSaved = 0;
    for await (const event of streamReply({
      threadId: conversationId,
      runId,
      messages: turns.map(({ role, content }) => ({ role, content })),
      systemPrompts,
      abortController,
    })) {
      if (event.type === 'finished') {
        usage = event.usage ?? null;
        if (reply.trim()) status = 'completed';
      } else {
        const next = reply + event.text;
        if (next.length > REPLY_MAX_CHARS) throw new Error('Reply is too long');
        reply = next;
        if (Date.now() - lastSaved >= 180) {
          if (!(await save('streaming'))) return;
          lastSaved = Date.now();
        }
      }
    }
  } catch {
    status = 'interrupted';
  } finally {
    clearTimeout(timer);
    abortController.abort();
    await save(status).catch(() => undefined);
  }
}

export async function getChatHistory(db: Db, userId: string, threadId: string) {
  const owner = await db
    .from('conversations')
    .select('id,character_id,is_voice_spike')
    .eq('user_id', userId)
    .eq('id', threadId)
    .maybeSingle();
  if (owner.error) throw new Error('Could not load conversation');
  if (!(owner.data && (owner.data.is_voice_spike || owner.data.character_id)))
    return owner.data
      ? null
      : {
          messages: [],
          activeRun: null,
          callActive: await isCallActive(db, userId),
        };

  // Check the lease before loading messages so an observed release also observes the call's commits.
  const callActive = await isCallActive(db, userId);
  const active = await db
    .from('voice_spike_chat_runs')
    .select('id')
    .eq('user_id', userId)
    .eq('conversation_id', threadId)
    .eq('status', 'streaming')
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  const history = await db
    .from('conversation_messages')
    .select('id,role,parts,status')
    .eq('conversation_id', threadId)
    .in('status', ['completed', 'interrupted'])
    .order('position', { ascending: false })
    .limit(100);
  if (active.error || history.error) throw new Error('Could not load history');
  const messages: UIMessage[] = historySchema
    .parse(history.data)
    .reverse()
    .filter((row) => row.id !== `chat-assistant:${active.data?.id}`)
    .map(({ id, role, parts }) => ({ id, role, parts }));
  return {
    messages,
    activeRun: active.data ? { runId: active.data.id } : null,
    callActive,
  };
}

async function isCallActive(db: Db, userId: string) {
  const lease = await db
    .from('voice_spike_calls')
    .select('room_name')
    .eq('user_id', userId)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  if (lease.error) throw new Error('Could not load voice lease');
  return Boolean(lease.data && !lease.data.room_name.startsWith('chat:'));
}

export function readChat(db: Db, userId: string, runId: string) {
  return db
    .rpc('read_voice_spike_chat', {
      p_user_id: userId,
      p_run_id: runId,
    })
    .maybeSingle();
}

type Snapshot = Awaited<ReturnType<typeof readChat>>['data'] & object;

interface DeliveryEvent {
  chunk: StreamChunk;
  offset: number;
}

export async function* replayChat(
  first: Snapshot,
  read: () => PromiseLike<Snapshot>,
  wireId: string,
  messageId: string,
  after: number,
  signal: AbortSignal,
) {
  let cursor = after;
  const threadId = first.thread_id;
  if (cursor < 0) {
    yield {
      offset: 0,
      chunk: { type: EventType.RUN_STARTED, threadId, runId: wireId },
    } satisfies DeliveryEvent;
    cursor = 0;
  }
  let snapshot = first;
  while (!signal.aborted) {
    const { reply, status } = snapshot;
    if (reply && cursor < 1) {
      yield {
        offset: 1,
        chunk: {
          type: EventType.TEXT_MESSAGE_START,
          messageId,
          role: 'assistant',
        },
      } satisfies DeliveryEvent;
      cursor = 1;
    }
    if (reply.length + 1 > cursor && reply) {
      yield {
        offset: reply.length + 1,
        chunk: {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId,
          delta: reply.slice(cursor - 1),
        },
      } satisfies DeliveryEvent;
      cursor = reply.length + 1;
    }
    if (status !== 'streaming') {
      if (reply && cursor < reply.length + 2) {
        yield {
          offset: reply.length + 2,
          chunk: { type: EventType.TEXT_MESSAGE_END, messageId },
        } satisfies DeliveryEvent;
      }
      if (cursor < reply.length + 3) {
        yield {
          offset: reply.length + 3,
          chunk:
            status === 'completed'
              ? { type: EventType.RUN_FINISHED, threadId, runId: wireId }
              : {
                  type: EventType.RUN_ERROR,
                  runId: wireId,
                  message: 'The reply was interrupted.',
                },
        } satisfies DeliveryEvent;
      }
      return;
    }
    await delay(240, undefined, { signal }).catch((error) => {
      if (!signal.aborted) throw error;
    });
    if (!signal.aborted) snapshot = await read();
  }
}

export function chatEventsResponse(
  events: AsyncGenerator<DeliveryEvent>,
  signal: AbortSignal,
) {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      async pull(controller) {
        if (signal.aborted) {
          controller.close();
          return;
        }
        const event = await events.next();
        if (event.done) {
          controller.close();
          return;
        }
        const { offset, chunk } = event.value;
        controller.enqueue(
          encoder.encode(`id: ${offset}\ndata: ${JSON.stringify(chunk)}\n\n`),
        );
      },
      async cancel() {
        await events.return(undefined);
      },
    }),
    {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'private, no-store, no-transform',
        'X-Accel-Buffering': 'no',
      },
    },
  );
}
