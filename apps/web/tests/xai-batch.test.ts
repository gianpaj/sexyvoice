import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createBatch,
  extractBatchOutcome,
  getBatchOutcomes,
  getBatchState,
  isBatchSettled,
  toBatchJsonl,
  uploadBatchInputFile,
  waitForBatch,
} from '@/lib/ai/xai-batch';

const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status: 200,
    ...init,
  });
}

describe('xai-batch client', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('XAI_API_KEY', 'test-key');
    vi.stubEnv('XAI_API_BASE_URL', 'https://xai.test/');
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('serialises requests as newline-terminated JSONL', () => {
    const jsonl = toBatchJsonl([
      {
        body: { messages: [{ content: 'hi', role: 'user' }], model: 'm' },
        custom_id: 'a',
        method: 'POST',
        url: '/v1/chat/completions',
      },
    ]);
    expect(jsonl.endsWith('\n')).toBe(true);
    expect(JSON.parse(jsonl.trim()).custom_id).toBe('a');
  });

  it('uploads the JSONL file with the bearer token and returns the file id', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 'file_1' }));

    const fileId = await uploadBatchInputFile('{}\n', 'batch.jsonl');

    expect(fileId).toBe('file_1');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://xai.test/v1/files');
    expect(init?.method).toBe('POST');
    expect(
      (init?.headers as Record<string, string> | undefined)?.Authorization,
    ).toBe('Bearer test-key');
    expect(init?.body).toBeInstanceOf(FormData);
  });

  it('creates a batch and surfaces API errors with the response detail', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ batch_id: 'batch_1' }));
    await expect(createBatch('name', 'file_1')).resolves.toBe('batch_1');
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({
      input_file_id: 'file_1',
      name: 'name',
    });

    fetchMock.mockResolvedValueOnce(
      new Response('quota exceeded', { status: 429, statusText: 'Too Many' }),
    );
    await expect(createBatch('name', 'file_1')).rejects.toThrow(
      /POST \/v1\/batches failed: 429 Too Many - quota exceeded/,
    );
  });

  it('throws when XAI_API_KEY is missing', async () => {
    vi.stubEnv('XAI_API_KEY', '');
    await expect(getBatchState('batch_1')).rejects.toThrow('XAI_API_KEY');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reads the nested state object and decides settlement', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ state: { num_pending: 2, num_requests: 3 } }),
    );
    expect(await getBatchState('batch_1')).toEqual({
      num_pending: 2,
      num_requests: 3,
    });

    expect(isBatchSettled({})).toBe(false); // nothing registered yet
    expect(isBatchSettled({ num_pending: 1, num_requests: 1 })).toBe(false);
    expect(isBatchSettled({ num_pending: 0, num_requests: 2 })).toBe(true);
    expect(isBatchSettled({ num_error: 1, num_pending: 0 })).toBe(true);
  });

  it('extracts content and errors from both documented result shapes', () => {
    expect(
      extractBatchOutcome({
        custom_id: 'a',
        response: { body: { choices: [{ message: { content: '{"x":1}' } }] } },
      }),
    ).toEqual({ content: '{"x":1}', customId: 'a', errorMessage: null });

    expect(
      extractBatchOutcome({
        batch_request_id: 'b',
        batch_result: {
          response: {
            chat_get_completion: {
              choices: [{ message: { content: 'inline' } }],
            },
          },
        },
      }),
    ).toEqual({ content: 'inline', customId: 'b', errorMessage: null });

    expect(
      extractBatchOutcome({
        custom_id: 'c',
        error: { message: 'boom' },
      }),
    ).toMatchObject({ content: null, customId: 'c', errorMessage: 'boom' });

    expect(extractBatchOutcome(null)).toEqual({
      content: null,
      customId: null,
      errorMessage: null,
    });
  });

  it('follows result pagination and indexes outcomes by custom_id', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          pagination_token: 'next',
          results: [
            {
              custom_id: 'a',
              response: { choices: [{ message: { content: 'A' } }] },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          results: [{ custom_id: 'b', error_message: 'failed' }],
        }),
      );

    const outcomes = await getBatchOutcomes('batch_1');

    expect([...outcomes.keys()]).toEqual(['a', 'b']);
    expect(outcomes.get('b')?.errorMessage).toBe('failed');
    expect(String(fetchMock.mock.calls[1][0])).toContain(
      'pagination_token=next',
    );
  });

  it('polls until settled and reports an exhausted budget', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ num_pending: 1, num_requests: 1 }))
      .mockResolvedValueOnce(jsonResponse({ num_pending: 0, num_requests: 1 }));
    const onPoll = vi.fn();

    await expect(
      waitForBatch('batch_1', { onPoll, pollIntervalMs: 1, timeoutMs: 10_000 }),
    ).resolves.toMatchObject({ settled: true });
    expect(onPoll).toHaveBeenCalledTimes(2);

    fetchMock.mockResolvedValue(
      jsonResponse({ num_pending: 1, num_requests: 1 }),
    );
    await expect(
      waitForBatch('batch_1', { pollIntervalMs: 50, timeoutMs: 10 }),
    ).resolves.toMatchObject({ settled: false });
  });
});
