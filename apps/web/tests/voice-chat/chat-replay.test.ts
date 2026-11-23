import { afterEach, describe, expect, it, vi } from 'vitest';

import { chatRunId, createChatDb, replayChat } from '@/lib/voice-chat/chat';

const thread = '60606060-6060-4060-8060-606060606061';

afterEach(() => vi.unstubAllEnvs());

describe('local voice chat database', () => {
  it('uses the normal local API when the override is blank', () => {
    vi.stubEnv('VOICE_CHAT_LOCAL_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:55321');
    vi.stubEnv('SUPABASE_SECRET_KEY', 'test-service-key');
    expect(createChatDb()).toBeDefined();
  });
});

describe('chat replay', () => {
  it('delivers only the unsent suffix after an SSE reconnect', async () => {
    const read = vi.fn().mockResolvedValueOnce({
      thread_id: thread,
      status: 'completed',
      reply: 'The blue door.',
    });
    const chunks = await Array.fromAsync(
      replayChat(
        { thread_id: thread, status: 'streaming', reply: 'The blue' },
        read,
        'wire',
        'message',
        'The blue'.length + 1,
        new AbortController().signal,
      ),
    );
    expect(chunks.map(({ chunk }) => chunk)).toEqual([
      { type: 'TEXT_MESSAGE_CONTENT', messageId: 'message', delta: ' door.' },
      { type: 'TEXT_MESSAGE_END', messageId: 'message' },
      { type: 'RUN_FINISHED', threadId: thread, runId: 'wire' },
    ]);
    expect(read).toHaveBeenCalledOnce();
  });

  it('replays an interrupted producer from the start with its partial text', async () => {
    const read = vi.fn();
    const chunks = await Array.fromAsync(
      replayChat(
        { thread_id: thread, status: 'interrupted', reply: 'Partial.' },
        read,
        'wire',
        'message',
        -1,
        new AbortController().signal,
      ),
    );
    expect(chunks.map(({ chunk }) => chunk.type)).toEqual([
      'RUN_STARTED',
      'TEXT_MESSAGE_START',
      'TEXT_MESSAGE_CONTENT',
      'TEXT_MESSAGE_END',
      'RUN_ERROR',
    ]);
    expect(read).not.toHaveBeenCalled();
  });

  it('resolves a run ID issued before the schema rename', () => {
    const id = chatRunId('run-123456abc');
    expect(id).toBe('4f1a58f4-3d20-5fbb-8dea-5f072a71f193');
    expect(chatRunId(id)).toBe(id);
    expect(chatRunId('run-123456abcd')).not.toBe(id);
  });
});
