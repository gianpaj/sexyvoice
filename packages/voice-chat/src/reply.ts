import {
  chat,
  createModel,
  extendAdapter,
  fromSpecTokenUsage,
  type ModelMessage,
  type RunFinishedEvent,
} from '@tanstack/ai';
import { createGrokText } from '@tanstack/ai-grok';

export const REPLY_MODEL = 'grok-4.20-0309-non-reasoning';

export class ReplyStreamError extends Error {
  readonly usage: ReturnType<typeof replyTokenUsage>;

  constructor(usage: ReturnType<typeof replyTokenUsage>) {
    super('Grok generation failed');
    this.usage = usage;
  }
}

const grok = extendAdapter(createGrokText, [
  createModel(REPLY_MODEL, ['text']),
]);

export async function* streamReply({
  threadId,
  runId,
  messages,
  systemPrompts,
  abortController,
  maxOutputTokens = 256,
}: {
  threadId: string;
  runId?: string;
  messages: ModelMessage[];
  systemPrompts: string[];
  abortController: AbortController;
  maxOutputTokens?: number;
}) {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) throw new Error('XAI_API_KEY is required');
  for await (const event of chat({
    adapter: grok(REPLY_MODEL, apiKey, { maxRetries: 0 }),
    threadId,
    runId,
    abortController,
    messages,
    systemPrompts,
    modelOptions: { max_output_tokens: maxOutputTokens },
  })) {
    if (event.type === 'RUN_ERROR')
      throw new ReplyStreamError(replyTokenUsage(event));
    if (event.type === 'RUN_FINISHED') {
      yield { type: 'finished' as const, usage: replyTokenUsage(event) };
      continue;
    }
    abortController.signal.throwIfAborted();
    if (event.type === 'TEXT_MESSAGE_CONTENT' && event.delta)
      yield { type: 'text' as const, text: event.delta };
  }
}

function replyTokenUsage(event: Pick<RunFinishedEvent, 'usage'>) {
  if (!event.usage) return;
  const usage = Array.isArray(event.usage)
    ? fromSpecTokenUsage(event.usage)
    : event.usage;
  if (!usage) return;
  return {
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    totalTokens: usage.totalTokens,
    promptCachedTokens: usage.promptTokensDetails?.cachedTokens ?? 0,
    reasoningTokens: usage.completionTokensDetails?.reasoningTokens ?? 0,
  };
}
