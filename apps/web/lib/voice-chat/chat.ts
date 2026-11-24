import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import {
  conversationContextSchema,
  historySchema,
  loadThreadCharacter,
  replyInstructions,
  threadSchema,
} from '@sexyvoice/voice-chat/history';
import { loadMemory } from '@sexyvoice/voice-chat/memory';
import {
  REPLY_MODEL,
  ReplyStreamError,
  streamReply,
} from '@sexyvoice/voice-chat/reply';
import { createClient } from '@supabase/supabase-js';
import { EventType, type StreamChunk } from '@tanstack/ai';
import type { UIMessage } from '@tanstack/ai-react';
import { z } from 'zod';

import { hasUserPaidAdmin } from '@/lib/supabase/queries';
import { fitChatBudget } from './chat-budget';
import { CHAT_BALANCE_ERROR, CHAT_HISTORY_PAGE_SIZE } from './protocol';

const READ_TIMEOUT_MS = 4000;
const REPLY_MAX_CHARS = 8000;
export const wireRunId = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
const uuid = z.uuid();

export function chatRunId(id: string) {
  if (uuid.safeParse(id).success) return id;
  const hash = createHash('sha256')
    // Keep the namespace stable so existing TanStack run IDs still resolve.
    .update('voice-spike-chat:')
    .update(id)
    .digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

export function createChatDb() {
  const url = new URL(
    process.env.VOICE_CHAT_LOCAL_SUPABASE_URL?.trim() ||
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
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
  let timer = globalThis.setTimeout(() => abortController.abort(), 55_000);
  let reply = '';
  let replyCapped = false;
  let status: 'completed' | 'interrupted' = 'interrupted';
  let usage: Json = null;
  const save = async (state: 'streaming' | typeof status) => {
    const { data, error } = await db.rpc('save_voice_chat_reply', {
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
    const [thread, history, reservation] = await Promise.all([
      db
        .from('conversations')
        .select(
          'character_id,character_name,uses_default_character,language,scene_instructions',
        )
        .eq('user_id', userId)
        .eq('id', conversationId)
        .single(),
      db.rpc('read_conversation_context', {
        p_user_id: userId,
        p_conversation_id: conversationId,
      }),
      db
        .from('voice_chat_runs')
        .select(
          'expires_at,reserved_credits,voice_chat_rates!inner(model,input_token_limit,output_token_limit,input_credits_per_million,output_credits_per_million)',
        )
        .eq('user_id', userId)
        .eq('id', runId)
        .eq('status', 'streaming')
        .gt('expires_at', new Date().toISOString())
        .single(),
    ]);
    if (thread.error || history.error || reservation.error)
      throw new Error('Could not load chat context');
    // Leave time for settlement even if the post-response worker began late.
    const remaining =
      Date.parse(reservation.data.expires_at) - Date.now() - 9000;
    if (remaining <= 0) throw new Error('Chat reservation expired');
    clearTimeout(timer);
    timer = globalThis.setTimeout(
      () => abortController.abort(),
      Math.min(55_000, remaining),
    );
    const rate = reservation.data.voice_chat_rates;
    if (rate.model !== REPLY_MODEL)
      throw new Error('Chat model price unavailable');
    const config = threadSchema.parse(thread.data);
    const character = config.character_id
      ? await loadThreadCharacter(
          db,
          userId,
          config.character_id,
          config.language,
        )
      : null;
    if (
      config.character_id &&
      !(character && (character.isPublic || (await hasUserPaidAdmin(userId))))
    )
      throw new Error('Character unavailable');
    const memory = await loadMemory(db, userId, config.character_id);
    const turns = conversationContextSchema.parse(history.data);
    if (turns.at(-1)?.id !== `chat-user:${runId}`)
      throw new Error('Chat turn is no longer current');
    const messages = turns.map(({ role, content }) => ({ role, content }));
    let systemPrompts = [
      ...replyInstructions(config, {
        character: character?.instructions,
        memory: memory?.instructions,
      }),
      'Match the depth of your reply to the latest user message. For a greeting or quick check-in, reply in one short, in-character sentence with at most one question. Expand when the user asks for detail.',
    ];
    const limits = {
      reservedCredits: reservation.data.reserved_credits,
      inputTokenLimit: rate.input_token_limit,
      outputTokenLimit: rate.output_token_limit,
      inputCreditsPerMillion: rate.input_credits_per_million,
      outputCreditsPerMillion: rate.output_credits_per_million,
    };
    let budget = fitChatBudget(systemPrompts, messages, limits);
    if (budget === CHAT_BALANCE_ERROR) {
      usage = { failure: CHAT_BALANCE_ERROR };
      return;
    }
    if (!budget) throw new Error('Chat prompt exceeds the input limit');

    abortController.signal.throwIfAborted();
    const recalled = await memory?.recall?.(text);
    if (recalled) {
      const expandedPrompts = [...systemPrompts, recalled];
      const expandedBudget = fitChatBudget(expandedPrompts, messages, limits);
      if (expandedBudget && expandedBudget !== CHAT_BALANCE_ERROR) {
        systemPrompts = expandedPrompts;
        budget = expandedBudget;
      }
    }
    abortController.signal.throwIfAborted();
    let lastSaved = 0;
    for await (const event of streamReply({
      threadId: conversationId,
      runId,
      ...budget,
      systemPrompts,
      abortController,
    })) {
      if (event.type === 'finished') {
        usage = event.usage ?? null;
        if (reply.trim() && !replyCapped) status = 'completed';
      } else if (!replyCapped) {
        const next = reply + event.text;
        replyCapped = next.length > REPLY_MAX_CHARS;
        // Keep consuming the stream for authoritative usage at the text cap.
        reply = replyCapped
          ? next.slice(0, REPLY_MAX_CHARS).replace(/[\uD800-\uDBFF]$/, '')
          : next;
        if (Date.now() - lastSaved >= 180) {
          if (!(await save('streaming'))) return;
          lastSaved = Date.now();
        }
      }
    }
  } catch (error) {
    if (error instanceof ReplyStreamError && error.usage) usage = error.usage;
    status = 'interrupted';
  } finally {
    clearTimeout(timer);
    abortController.abort();
    try {
      await save(status);
    } catch {
      // The first settlement may have committed without a response.
      await save(status).catch(() => {
        console.error('Chat settlement failed', { runId });
      });
    }
  }
}

export async function getChatHistory(db: Db, userId: string, threadId: string) {
  const owner = await db
    .from('conversations')
    .select('id,character_id,uses_default_character')
    .eq('user_id', userId)
    .eq('id', threadId)
    .maybeSingle();
  if (owner.error) throw new Error('Could not load conversation');
  if (
    !(
      owner.data &&
      (owner.data.uses_default_character || owner.data.character_id)
    )
  )
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
    .from('voice_chat_runs')
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
    .limit(CHAT_HISTORY_PAGE_SIZE);
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
  const { data, error } = await db.rpc('has_active_voice_call', {
    p_user_id: userId,
  });
  if (error) throw new Error('Could not load active call status');
  return data === true;
}

export function readChat(db: Db, userId: string, runId: string) {
  return db
    .rpc('read_voice_chat', {
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
                  ...(status === CHAT_BALANCE_ERROR
                    ? {
                        code: CHAT_BALANCE_ERROR,
                        message: 'Not enough credits for this reply',
                      }
                    : { message: 'The reply was interrupted.' }),
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
