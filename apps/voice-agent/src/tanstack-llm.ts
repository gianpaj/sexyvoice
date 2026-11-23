import { randomUUID } from 'node:crypto';
import { llm } from '@livekit/agents';
import { REPLY_MODEL, streamReply } from '@sexyvoice/voice-spike/reply';

import type { TrackReply } from './call-accounting.ts';

interface TanStackLLMOptions {
  generate?: typeof streamReply;
  trackReply?: TrackReply;
}

export class TanStackLLM extends llm.LLM {
  private readonly threadId: string;
  private readonly generate: typeof streamReply;
  private readonly trackReply?: TrackReply;

  constructor(
    threadId: string,
    { generate = streamReply, trackReply }: TanStackLLMOptions = {},
  ) {
    super();
    this.threadId = threadId;
    this.generate = generate;
    this.trackReply = trackReply;
  }

  override get model() {
    return REPLY_MODEL;
  }

  override get provider() {
    return 'xai';
  }

  label() {
    return 'tanstack.Grok';
  }

  chat({ chatCtx }: Parameters<llm.LLM['chat']>[0]): llm.LLMStream {
    return new TanStackLLMStream(
      this,
      chatCtx,
      this.threadId,
      this.generate,
      this.trackReply,
    );
  }
}

class TanStackLLMStream extends llm.LLMStream {
  private readonly threadId: string;
  private readonly generate: typeof streamReply;
  private readonly trackReply?: TrackReply;

  constructor(
    model: TanStackLLM,
    chatCtx: llm.ChatContext,
    threadId: string,
    generate: typeof streamReply,
    trackReply?: TrackReply,
  ) {
    super(model, {
      chatCtx,
      connOptions: { maxRetry: 0, retryIntervalMs: 0, timeoutMs: 15_000 },
    });
    this.threadId = threadId;
    this.generate = generate;
    this.trackReply = trackReply;
  }

  protected async run() {
    const messages: Parameters<typeof streamReply>[0]['messages'] = [];
    const systemPrompts: string[] = [];
    for (const item of this.chatCtx.items) {
      if (item.type !== 'message' || !item.textContent) continue;
      if (item.role === 'system' || item.role === 'developer') {
        systemPrompts.push(item.textContent);
      } else if (item.role === 'user' || item.role === 'assistant') {
        messages.push({ role: item.role, content: item.textContent });
      }
    }
    const runId = randomUUID();
    if (this.abortController.signal.aborted) return;
    const reportUsage = this.trackReply?.();
    try {
      for await (const event of this.generate({
        threadId: this.threadId,
        runId,
        messages,
        systemPrompts,
        abortController: this.abortController,
      })) {
        if (event.type === 'text') {
          this.queue.put({
            id: runId,
            delta: { role: 'assistant', content: event.text },
          });
        }
        if (event.type === 'finished' && event.usage) {
          reportUsage?.(event.usage);
          this.queue.put({ id: runId, usage: event.usage });
        }
      }
    } catch (error) {
      if (!this.abortController.signal.aborted) throw error;
    }
  }
}
