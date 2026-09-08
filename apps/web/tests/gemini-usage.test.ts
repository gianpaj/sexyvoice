import { FinishReason, type GenerateContentResponse } from '@google/genai';
import { after } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { insertUsageEvent } from '@/lib/supabase/queries';
import {
  trackGeminiGeneration,
  trackGeminiStream,
} from '@/lib/tts/gemini-usage';
import { extractMetadata } from '@/lib/utils';

const context = {
  inputChars: 50,
  model: 'gemini-3.1-flash-tts-preview',
  requestId: 'request',
  sourceType: 'tts' as const,
  userId: 'user',
};
const response = (
  usageMetadata: GenerateContentResponse['usageMetadata'],
  finishReason = FinishReason.STOP,
): GenerateContentResponse =>
  ({
    candidates: [
      {
        content: {
          parts: [{ inlineData: { data: 'AA==', mimeType: 'audio/pcm' } }],
        },
        finishReason,
      },
    ],
    responseId: 'google-response',
    usageMetadata,
  }) as GenerateContentResponse;

vi.mock('next/server', () => ({
  after: vi.fn((callback: () => Promise<void>) => callback()),
}));

beforeEach(() => vi.clearAllMocks());

describe('Gemini token parsing', () => {
  it('preserves zero and partial counts without inventing missing values', () => {
    expect(
      extractMetadata(
        true,
        response({ promptTokenCount: 0, totalTokenCount: 7 }),
      ),
    ).toEqual({ promptTokenCount: '0', totalTokenCount: '7' });
    expect(
      extractMetadata(
        true,
        response({
          candidatesTokenCount: 0,
          promptTokenCount: 0,
          totalTokenCount: 0,
        }),
      ),
    ).toEqual({
      candidatesTokenCount: '0',
      promptTokenCount: '0',
      totalTokenCount: '0',
    });
    expect(extractMetadata(true, response({}))).toBeUndefined();
  });
});

describe('Gemini provider attempts', () => {
  it('returns the response before the deferred insert starts', async () => {
    let deferred: (() => void | Promise<void>) | undefined;
    vi.mocked(after).mockImplementationOnce((callback) => {
      deferred = callback as () => void | Promise<void>;
    });
    const result = response({ candidatesTokenCount: 20, promptTokenCount: 10 });
    await expect(
      trackGeminiGeneration(context, async () => result),
    ).resolves.toBe(result);
    expect(insertUsageEvent).not.toHaveBeenCalled();
    expect(deferred).toBeTypeOf('function');
    await deferred?.();
    expect(insertUsageEvent).toHaveBeenCalledOnce();
  });

  it('records tokens and estimated cost in the scheduled callback', async () => {
    const result = response({
      candidatesTokenCount: 1000,
      promptTokenCount: 100,
      totalTokenCount: 1100,
    });
    expect(await trackGeminiGeneration(context, async () => result)).toBe(
      result,
    );
    expect(insertUsageEvent).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        creditsUsed: 0,
        dollarAmount: 0.0201,
        eventKind: 'provider_attempt',
        inputTokens: 100,
        metadata: expect.objectContaining({
          costStatus: 'estimated',
          httpStatus: 200,
          outcome: 'success',
        }),
        outputTokens: 1000,
        totalTokens: 1100,
      }),
    );
  });

  it.each([400, 500])(
    'excludes HTTP %s without swallowing the provider error',
    async (status) => {
      const error = Object.assign(new Error('provider error'), { status });
      await expect(
        trackGeminiGeneration(context, async () => {
          throw error;
        }),
      ).rejects.toBe(error);
      expect(insertUsageEvent).not.toHaveBeenCalled();
    },
  );

  it.each([429, 503, undefined])(
    'records HTTP %s failures with unknown cost',
    async (status) => {
      const error = Object.assign(new Error('provider error'), { status });
      await expect(
        trackGeminiGeneration(context, async () => {
          throw error;
        }),
      ).rejects.toBe(error);
      expect(insertUsageEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          dollarAmount: null,
          inputTokens: null,
          metadata: expect.objectContaining({
            costStatus: 'unknown',
            httpStatus: status ?? null,
            outcome: 'error',
          }),
          outputTokens: null,
        }),
      );
    },
  );

  it('records blocked HTTP 200 and retains partial counts', async () => {
    await trackGeminiGeneration(context, async () =>
      response({ promptTokenCount: 5 }, FinishReason.SAFETY),
    );
    expect(insertUsageEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        dollarAmount: null,
        inputTokens: 5,
        metadata: expect.objectContaining({
          httpStatus: 200,
          outcome: 'content_blocked',
        }),
        outputTokens: null,
      }),
    );
  });

  it('keeps stream snapshots cumulative and merges partial terminal metadata', async () => {
    async function* chunks() {
      yield response({ candidatesTokenCount: 20, promptTokenCount: 10 });
      yield response({ candidatesTokenCount: 30 });
      yield response({ totalTokenCount: 40 });
    }
    for await (const _chunk of trackGeminiStream(context, async () =>
      chunks(),
    )) {
      /* consume */
    }
    expect(insertUsageEvent).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        dollarAmount: 0.000_61,
        inputTokens: 10,
        outputTokens: 30,
        totalTokens: 40,
      }),
    );
  });

  it('preserves partial stream usage when the connection fails', async () => {
    const error = new Error('connection lost');
    async function* chunks() {
      yield response({ candidatesTokenCount: 30, promptTokenCount: 10 });
      throw error;
    }
    await expect(
      (async () => {
        for await (const _chunk of trackGeminiStream(context, async () =>
          chunks(),
        )) {
          /* consume */
        }
      })(),
    ).rejects.toBe(error);
    expect(insertUsageEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        inputTokens: 10,
        metadata: expect.objectContaining({ outcome: 'error' }),
        outputTokens: 30,
      }),
    );
  });

  it('records each fallback attempt separately with the actual model and shared request ID', async () => {
    await trackGeminiGeneration(context, async () => {
      throw Object.assign(new Error('unavailable'), { status: 503 });
    }).catch(() => undefined);
    await trackGeminiGeneration(
      { ...context, model: 'gemini-2.5-flash-preview-tts' },
      async () => response({ candidatesTokenCount: 20, promptTokenCount: 10 }),
    );
    expect(insertUsageEvent).toHaveBeenCalledTimes(2);
    expect(insertUsageEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({
        dollarAmount: 0.000_205,
        model: 'gemini-2.5-flash-preview-tts',
        requestId: 'request',
      }),
    );
  });

  it('records a client cancellation with the usage already received', async () => {
    const controller = new AbortController();
    async function* chunks() {
      yield response({ candidatesTokenCount: 30, promptTokenCount: 10 });
    }
    for await (const _chunk of trackGeminiStream(
      { ...context, signal: controller.signal },
      async () => chunks(),
    )) {
      controller.abort();
      break;
    }
    expect(insertUsageEvent).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        inputTokens: 10,
        metadata: expect.objectContaining({
          completed: false,
          outcome: 'aborted',
        }),
        outputTokens: 30,
      }),
    );
  });

  it('excludes a structured Google 400 error from usage events', async () => {
    const error = new Error(
      JSON.stringify({
        error: { code: 400, message: 'invalid', status: 'INVALID_ARGUMENT' },
      }),
    );
    await expect(
      trackGeminiGeneration(context, async () => {
        throw error;
      }),
    ).rejects.toBe(error);
    expect(insertUsageEvent).not.toHaveBeenCalled();
  });

  it('does not fail generation when telemetry insertion throws', async () => {
    vi.mocked(insertUsageEvent).mockRejectedValueOnce(
      new Error('database unavailable'),
    );
    const result = response({ candidatesTokenCount: 20, promptTokenCount: 10 });
    await expect(
      trackGeminiGeneration(context, async () => result),
    ).resolves.toBe(result);
  });
});
