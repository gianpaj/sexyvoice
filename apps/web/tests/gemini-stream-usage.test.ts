import { FinishReason, type GenerateContentResponse } from '@google/genai';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { POST } from '@/app/api/generate-voice/route';
import { hasUserPaid, insertUsageEvent } from '@/lib/supabase/queries';
import {
  createDefaultStreamChunk,
  mockUploadFileToR2,
  resetMockGoogleGenAIFactory,
  setMockGoogleGenAIFactory,
} from './setup';

// Exercise the retained streaming path without enabling it for production.
vi.mock('@/lib/ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ai')>()),
  GEMINI_STREAMING_ENABLED: true,
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(hasUserPaid).mockResolvedValueOnce(true);
});
afterEach(() => resetMockGoogleGenAIFactory());

async function generate() {
  const response = await POST(
    new Request('http://localhost/api/generate-voice', {
      body: JSON.stringify({
        stream: true,
        text: 'Hello world',
        voiceId: 'voice-achernar-31-id',
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    }),
  );
  expect(response.headers.get('content-type')).toContain('text/event-stream');
  return response.text();
}

it('stores streaming tokens and dollar amount once, separately from customer credits', async () => {
  setMockGoogleGenAIFactory(() => ({
    models: {
      async *generateContentStream() {
        yield createDefaultStreamChunk();
      },
    },
  }));
  expect(await generate()).toContain('event: done');
  const events = vi.mocked(insertUsageEvent).mock.calls.map(([event]) => event);
  expect(events).toHaveLength(2);
  expect(events[0]).toMatchObject({
    creditsUsed: 0,
    dollarAmount: 0.000_251,
    eventKind: 'provider_attempt',
    inputTokens: 11,
    outputTokens: 12,
    totalTokens: 23,
  });
  expect(events[1].dollarAmount).toBeUndefined();
  expect(events[1].creditsUsed).toBeGreaterThan(0);
  expect(events[0].requestId).toBe(events[1].requestId);
});

it('retains primary usage when a stream without audio falls back', async () => {
  let attempts = 0;
  setMockGoogleGenAIFactory(() => ({
    models: {
      async *generateContentStream() {
        attempts += 1;
        if (attempts === 1) {
          yield {
            candidates: [{ finishReason: FinishReason.STOP }],
            usageMetadata: {
              candidatesTokenCount: 50,
              promptTokenCount: 100,
              totalTokenCount: 150,
            },
          } as GenerateContentResponse;
        } else {
          yield createDefaultStreamChunk();
        }
      },
    },
  }));
  expect(await generate()).toContain('event: done');
  const events = vi.mocked(insertUsageEvent).mock.calls.map(([event]) => event);
  expect(events).toHaveLength(3);
  expect(events[0]).toMatchObject({
    dollarAmount: 0.0011,
    inputTokens: 100,
    metadata: { outcome: 'no_audio' },
    model: 'gemini-3.1-flash-tts-preview',
    outputTokens: 50,
  });
  expect(events[1]).toMatchObject({
    dollarAmount: 0.000_126,
    inputTokens: 11,
    model: 'gemini-2.5-flash-preview-tts',
    outputTokens: 12,
  });
  expect(new Set(events.map((event) => event.requestId)).size).toBe(1);
});

it('retains provider usage when audio upload fails', async () => {
  setMockGoogleGenAIFactory(() => ({
    models: {
      async *generateContentStream() {
        yield createDefaultStreamChunk();
      },
    },
  }));
  mockUploadFileToR2.mockRejectedValueOnce(new Error('upload unavailable'));
  expect(await generate()).toContain('event: error');
  expect(insertUsageEvent).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      creditsUsed: 0,
      dollarAmount: 0.000_251,
      eventKind: 'provider_attempt',
    }),
  );
});
