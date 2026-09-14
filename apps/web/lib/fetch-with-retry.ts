interface FetchWithRetryOptions<T> {
  maxTotalDelayMs?: number;
  parseResponse: (response: Response) => Promise<T>;
  requestInit?: Omit<RequestInit, 'signal'>;
  retryDelaysMs?: readonly number[];
  timeoutMs?: number;
}

function getRetryAfterDelayMs(response: Response): number | undefined {
  const value = response.headers.get('Retry-After')?.trim();
  if (!value) {
    return undefined;
  }

  if (/^\d+$/.test(value)) {
    return Number(value) * 1000;
  }
  if (Number.isFinite(Number(value))) {
    return undefined;
  }

  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}

/** Retries transient HTTP, network, and parsing errors. Only use for safe-to-repeat requests. */
export async function fetchWithRetry<T>(
  url: string,
  {
    maxTotalDelayMs = 30_000,
    parseResponse,
    requestInit,
    retryDelaysMs = [1000, 2000, 4000],
    timeoutMs = 5000,
  }: FetchWithRetryOptions<T>,
): Promise<T> {
  if (!Number.isFinite(maxTotalDelayMs) || maxTotalDelayMs < 0) {
    throw new RangeError('maxTotalDelayMs must be finite and non-negative');
  }

  let remainingDelayMs = maxTotalDelayMs;
  for (let attempt = 0; ; attempt++) {
    let response: Response | undefined;
    try {
      response = await fetch(url, {
        ...requestInit,
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await parseResponse(response);
    } catch (error) {
      const fallbackDelay = retryDelaysMs[attempt];
      if (
        fallbackDelay === undefined ||
        (response &&
          !response.ok &&
          response.status !== 408 &&
          response.status !== 429 &&
          !(response.status >= 500 && response.status < 600))
      ) {
        throw error;
      }

      const delay =
        (response && !response.ok
          ? getRetryAfterDelayMs(response)
          : undefined) ?? fallbackDelay;
      // Stop rather than retry before Retry-After or overflow Node's timer range.
      if (
        !Number.isFinite(delay) ||
        delay < 0 ||
        delay > remainingDelayMs ||
        delay > 2_147_483_647
      ) {
        throw error;
      }
      remainingDelayMs -= delay;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
