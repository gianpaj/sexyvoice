import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchWithRetry } from '@/lib/fetch-with-retry';

const url = 'https://example.com/billing';
const parseResponse = (response: Response) => response.json();
const fetchMock = vi.fn<typeof fetch>();

describe('fetchWithRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns immediately on success and forwards request options', async () => {
    fetchMock.mockResolvedValue(Response.json({ cost: 0 }));

    await expect(
      fetchWithRetry(url, {
        parseResponse,
        requestInit: {
          cache: 'no-store',
          headers: { Authorization: 'Key test' },
        },
      }),
    ).resolves.toEqual({ cost: 0 });
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(url, {
      cache: 'no-store',
      headers: { Authorization: 'Key test' },
      signal: expect.any(AbortSignal),
    });
  });

  it('waits 1s, 2s, and 4s between attempts and throws the final error', async () => {
    const error = new Error('network unavailable');
    fetchMock.mockRejectedValue(error);
    const result = expect(fetchWithRetry(url, { parseResponse })).rejects.toBe(
      error,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    for (const [index, delay] of [1000, 2000, 4000].entries()) {
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(fetchMock).toHaveBeenCalledTimes(index + 1);
      await vi.advanceTimersByTimeAsync(1);
      expect(fetchMock).toHaveBeenCalledTimes(index + 2);
    }
    await result;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('retries HTTP errors and stops after a successful retry', async () => {
    fetchMock
      .mockResolvedValueOnce(
        Response.json({ error: 'unavailable' }, { status: 503 }),
      )
      .mockResolvedValueOnce(Response.json({ cost: 12 }));
    const result = fetchWithRetry(url, { parseResponse });

    await vi.advanceTimersByTimeAsync(1000);
    await expect(result).resolves.toEqual({ cost: 12 });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([400, 401, 403, 404, 422])(
    'fails immediately on HTTP %s without parsing the body',
    async (status) => {
      fetchMock.mockResolvedValue(
        Response.json({ error: 'permanent' }, { status }),
      );
      const parse = vi.fn(parseResponse);

      await expect(
        fetchWithRetry(url, { parseResponse: parse }),
      ).rejects.toThrow(`HTTP ${status}`);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(parse).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it.each([408, 429, 500, 502, 504])(
    'retries HTTP %s with the default delay',
    async (status) => {
      fetchMock
        .mockResolvedValueOnce(
          Response.json({ error: 'temporary' }, { status }),
        )
        .mockResolvedValueOnce(Response.json({ cost: 12 }));
      const result = fetchWithRetry(url, { parseResponse });

      await vi.advanceTimersByTimeAsync(999);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      await expect(result).resolves.toEqual({ cost: 12 });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    },
  );

  it.each([
    ['3', 3000],
    ['Mon, 14 Sep 2026 12:00:05 GMT', 5000],
    ['Mon, 14 Sep 2026 11:59:59 GMT', 0],
    ['0', 0],
    ['invalid', 1000],
    ['1e3', 1000],
    ['1.5', 1000],
    ['-1', 1000],
    ['', 1000],
  ])('uses Retry-After %j with a delay of %s ms', async (retryAfter, delay) => {
    vi.setSystemTime(new Date('2026-09-14T12:00:00Z'));
    fetchMock
      .mockResolvedValueOnce(
        Response.json(
          { error: 'rate limited' },
          {
            headers: { 'Retry-After': retryAfter },
            status: 429,
          },
        ),
      )
      .mockResolvedValueOnce(Response.json({ cost: 12 }));
    const result = fetchWithRetry(url, { parseResponse });

    if (delay > 0) {
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
    } else {
      await vi.advanceTimersByTimeAsync(0);
    }
    await expect(result).resolves.toEqual({ cost: 12 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('limits rate-limit retries to the configured attempt count', async () => {
    fetchMock.mockImplementation(async () =>
      Response.json(
        { error: 'rate limited' },
        {
          headers: { 'Retry-After': '2' },
          status: 429,
        },
      ),
    );
    const result = expect(
      fetchWithRetry(url, { parseResponse }),
    ).rejects.toThrow('HTTP 429');

    await vi.advanceTimersByTimeAsync(6000);
    await result;
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    '31',
    '9999999999999999999999999999999999999999',
    'Mon, 14 Sep 2099 12:00:00 GMT',
  ])(
    'rejects Retry-After %s without scheduling a sleep beyond the budget',
    async (retryAfter) => {
      vi.setSystemTime(new Date('2026-09-14T12:00:00Z'));
      fetchMock.mockResolvedValue(
        Response.json(
          { error: 'rate limited' },
          {
            headers: { 'Retry-After': retryAfter },
            status: 429,
          },
        ),
      );

      await expect(fetchWithRetry(url, { parseResponse })).rejects.toThrow(
        'HTTP 429',
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('caps cumulative sleep at 30 seconds rather than capping each delay', async () => {
    fetchMock.mockImplementation(async () =>
      Response.json(
        { error: 'rate limited' },
        {
          headers: { 'Retry-After': '15' },
          status: 429,
        },
      ),
    );
    const result = expect(
      fetchWithRetry(url, { parseResponse }),
    ).rejects.toThrow('HTTP 429');

    await vi.advanceTimersByTimeAsync(29_999);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    await result;
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('allows a retry exactly at the sleep budget boundary', async () => {
    fetchMock
      .mockResolvedValueOnce(
        Response.json(
          { error: 'rate limited' },
          {
            headers: { 'Retry-After': '30' },
            status: 429,
          },
        ),
      )
      .mockResolvedValueOnce(Response.json({ cost: 12 }));
    const result = fetchWithRetry(url, { parseResponse });

    await vi.advanceTimersByTimeAsync(30_000);
    await expect(result).resolves.toEqual({ cost: 12 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('shares the sleep budget between fallback delays and Retry-After', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValueOnce(
        Response.json(
          { error: 'rate limited' },
          {
            headers: { 'Retry-After': '2' },
            status: 429,
          },
        ),
      );
    const result = expect(
      fetchWithRetry(url, { maxTotalDelayMs: 2500, parseResponse }),
    ).rejects.toThrow('HTTP 429');

    await vi.advanceTimersByTimeAsync(1000);
    await result;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([0, 500])(
    'does not sleep when the next fallback exceeds a %s ms budget',
    async (maxTotalDelayMs) => {
      fetchMock.mockRejectedValue(new Error('network unavailable'));
      await expect(
        fetchWithRetry(url, { maxTotalDelayMs, parseResponse }),
      ).rejects.toThrow('network unavailable');
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects an invalid sleep budget of %s',
    async (maxTotalDelayMs) => {
      await expect(
        fetchWithRetry(url, { maxTotalDelayMs, parseResponse }),
      ).rejects.toThrow('maxTotalDelayMs must be finite and non-negative');
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('retries JSON parsing and response validation errors', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('invalid json'))
      .mockResolvedValueOnce(Response.json({}))
      .mockResolvedValueOnce(Response.json({ cost: 12 }));
    const result = fetchWithRetry(url, {
      parseResponse: async (response) => {
        const data = await response.json();
        if (typeof data.cost !== 'number') {
          throw new Error('Missing cost');
        }
        return data.cost;
      },
    });

    await vi.advanceTimersByTimeAsync(3000);
    await expect(result).resolves.toBe(12);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('creates a fresh timeout signal for every attempt', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    fetchMock
      .mockRejectedValueOnce(new DOMException('Timed out', 'TimeoutError'))
      .mockResolvedValueOnce(Response.json({ cost: 1 }));
    const result = fetchWithRetry(url, { parseResponse, timeoutMs: 250 });

    await vi.advanceTimersByTimeAsync(1000);
    await expect(result).resolves.toEqual({ cost: 1 });
    expect(timeout).toHaveBeenCalledTimes(2);
    expect(timeout).toHaveBeenNthCalledWith(1, 250);
    expect(timeout).toHaveBeenNthCalledWith(2, 250);
    expect(fetchMock.mock.calls[0][1]?.signal).not.toBe(
      fetchMock.mock.calls[1][1]?.signal,
    );
  });

  it('supports custom retry delays and disabling retries', async () => {
    fetchMock.mockRejectedValue(new Error('unavailable'));
    await expect(
      fetchWithRetry(url, { parseResponse, retryDelaysMs: [] }),
    ).rejects.toThrow('unavailable');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockClear();
    const result = expect(
      fetchWithRetry(url, { parseResponse, retryDelaysMs: [50] }),
    ).rejects.toThrow('unavailable');
    await vi.advanceTimersByTimeAsync(50);
    await result;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
