import { initializeLogger, llm } from '@livekit/agents';
import type { streamReply } from '@sexyvoice/voice-spike/reply';
import { describe, expect, it, vi } from 'vitest';

import { TanStackLLM } from '../src/tanstack-llm.ts';

initializeLogger({ pretty: false, level: 'fatal' });

const chatCtx = new llm.ChatContext([
  llm.ChatMessage.create({
    role: 'system',
    content: 'Speak like a character.',
  }),
  llm.ChatMessage.create({ role: 'user', content: 'Remember the blue door.' }),
  llm.ChatMessage.create({ role: 'assistant', content: 'I remember.' }),
  llm.ChatMessage.create({ role: 'user', content: 'Which door?' }),
]);

describe('TanStack LiveKit generation', () => {
  it('streams visible deltas and reports cached and output tokens', async () => {
    const generate = vi.fn<typeof streamReply>(async function* () {
      await Promise.resolve();
      yield { type: 'text', text: 'Blue.' };
      yield {
        type: 'finished',
        usage: {
          promptTokens: 10,
          promptCachedTokens: 3,
          completionTokens: 2,
          totalTokens: 12,
          reasoningTokens: 0,
        },
      };
    });

    const stream = new TanStackLLM('thread', generate).chat({ chatCtx });
    const first = await stream.next();
    const second = await stream.next();
    expect(first.value).toMatchObject({
      delta: { role: 'assistant', content: 'Blue.' },
    });
    expect(second.value).toMatchObject({
      usage: {
        promptTokens: 10,
        promptCachedTokens: 3,
        completionTokens: 2,
        totalTokens: 12,
      },
    });
    expect((await stream.next()).done).toBe(true);
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: 'thread',
        systemPrompts: ['Speak like a character.'],
        messages: [
          { role: 'user', content: 'Remember the blue door.' },
          { role: 'assistant', content: 'I remember.' },
          { role: 'user', content: 'Which door?' },
        ],
      }),
    );
  });

  it('aborts the provider on LiveKit interruption', async () => {
    const cancelled = vi.fn();
    const generate: typeof streamReply = async function* ({ abortController }) {
      const ended = new Promise<void>((resolve) => {
        abortController.signal.addEventListener(
          'abort',
          () => {
            cancelled();
            resolve();
          },
          { once: true },
        );
      });
      yield { type: 'text', text: 'Blue' };
      await ended;
      abortController.signal.throwIfAborted();
    };
    const stream = new TanStackLLM('thread', generate).chat({ chatCtx });
    await stream.next();
    stream.close();
    expect((await stream.next()).done).toBe(true);
    expect(cancelled).toHaveBeenCalledOnce();
  });
});
