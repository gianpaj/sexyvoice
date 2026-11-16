import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createProbeProviders,
  streamInworldSpeech,
} from '@/lib/voice-spike/providers';

async function collect<T>(stream: AsyncIterable<T>) {
  const chunks: T[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return chunks;
}

function response(parts: string[]) {
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const part of parts)
          controller.enqueue(new TextEncoder().encode(part));
        controller.close();
      },
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('Inworld HTTP streaming', () => {
  it('parses split NDJSON, multiple lines and an unterminated last line, preserving first-chunk usage', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        response([
          '{"result":{"audioCon',
          'tent":"AAA=","usage":{"processedCharactersCount":5}}}\n{"result":{"audioContent":"AQA=","usage":{"processedCharactersCount":0}}}',
        ]),
      );
    vi.stubGlobal('fetch', fetch);
    const controller = new AbortController();
    const chunks = await collect(
      streamInworldSpeech('hello', controller.signal, 'test-key'),
    );
    expect(chunks).toEqual([
      { type: 'usage', characters: 5 },
      { type: 'audio', audio: 'AAA=' },
      { type: 'usage', characters: 0 },
      { type: 'audio', audio: 'AQA=' },
    ]);
    const request = fetch.mock.calls[0][1];
    expect(request.headers.Authorization).toBe('Basic test-key');
    expect(JSON.parse(request.body)).toMatchObject({
      modelId: 'inworld-tts-2',
      audioConfig: { audioEncoding: 'PCM', sampleRateHertz: 48_000 },
    });
    expect(request.signal).toBe(controller.signal);
  });

  it('surfaces a late provider error after partial audio', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          response([
            '{"result":{"audioContent":"AAA="}}\n{"error":{"code":3,"message":"secret provider detail"}}\n',
          ]),
        ),
    );
    const stream = streamInworldSpeech(
      'hello',
      new AbortController().signal,
      'key',
    )[Symbol.asyncIterator]();
    expect((await stream.next()).value).toEqual({
      type: 'audio',
      audio: 'AAA=',
    });
    await expect(stream.next()).rejects.toThrow('Inworld synthesis failed');
  });

  it('rejects HTTP errors, invalid PCM and oversized lines', async () => {
    for (const result of [
      new Response('sensitive response', { status: 401 }),
      response(['{"result":{"audioContent":"AA=="}}']),
      response(['x'.repeat(2_000_001)]),
      response(['{"result":{"usage":{"processedCharactersCount":5}}}']),
    ]) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(result));
      await expect(
        collect(
          streamInworldSpeech('hello', new AbortController().signal, 'key'),
        ),
      ).rejects.toThrow();
    }
  });

  it('does not submit missing credentials, oversized text or aborted requests', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(
      collect(streamInworldSpeech('hello', new AbortController().signal, '')),
    ).rejects.toThrow();
    await expect(
      collect(
        streamInworldSpeech(
          'a'.repeat(4001),
          new AbortController().signal,
          'key',
        ),
      ),
    ).rejects.toThrow();
    await expect(
      collect(streamInworldSpeech('hello', AbortSignal.abort(), 'key')),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('TanStack Grok 4.20 HTTP contract', () => {
  it('streams visible text through the real adapter using the pinned model, bounded output and no provider storage', async () => {
    vi.stubEnv('XAI_API_KEY', 'test-key');
    const events = [
      {
        type: 'response.created',
        response: {
          id: 'r1',
          model: 'grok-4.20-0309-non-reasoning',
          created_at: 1,
          output: [],
        },
      },
      {
        type: 'response.output_item.added',
        output_index: 0,
        item: {
          type: 'message',
          id: 'm1',
          role: 'assistant',
          content: [],
          status: 'in_progress',
        },
      },
      {
        type: 'response.content_part.added',
        output_index: 0,
        content_index: 0,
        item_id: 'm1',
        part: { type: 'output_text', text: '', annotations: [] },
      },
      {
        type: 'response.output_text.delta',
        item_id: 'm1',
        output_index: 0,
        content_index: 0,
        delta: 'Hello',
      },
      {
        type: 'response.output_text.done',
        item_id: 'm1',
        output_index: 0,
        content_index: 0,
        text: 'Hello',
      },
      {
        type: 'response.completed',
        response: {
          id: 'r1',
          model: 'grok-4.20-0309-non-reasoning',
          status: 'completed',
          created_at: 1,
          output: [
            {
              type: 'message',
              id: 'm1',
              role: 'assistant',
              content: [
                { type: 'output_text', text: 'Hello', annotations: [] },
              ],
              status: 'completed',
            },
          ],
          usage: {
            input_tokens: 10,
            input_tokens_details: { cached_tokens: 2 },
            output_tokens: 1,
            total_tokens: 11,
          },
        },
      },
    ];
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(
          events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(''),
          { headers: { 'Content-Type': 'text/event-stream' } },
        ),
      );
    vi.stubGlobal('fetch', fetch);
    const controller = new AbortController();
    const chunks = await collect(
      createProbeProviders().reply(
        [{ role: 'user', content: 'hello' }],
        controller,
      ),
    );
    expect(chunks).toContainEqual({ type: 'text', text: 'Hello' });
    expect(chunks.some((c) => c.type === 'usage')).toBe(true);
    expect(fetch).toHaveBeenCalledOnce();
    expect(String(fetch.mock.calls[0][0])).toBe(
      'https://api.x.ai/v1/responses',
    );
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body).toMatchObject({
      model: 'grok-4.20-0309-non-reasoning',
      max_output_tokens: 256,
      store: false,
      stream: true,
    });
  });
});
