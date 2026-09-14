interface FetchWithRetryOptions<T> {
  parseResponse: (response: Response) => Promise<T>;
  requestInit?: Omit<RequestInit, 'signal'>;
  retryDelaysMs?: readonly number[];
  timeoutMs?: number;
}

/** Retries failed requests and parsing/validation errors. Only use for safe-to-repeat requests. */
export async function fetchWithRetry<T>(
  url: string,
  {
    parseResponse,
    requestInit,
    retryDelaysMs = [1000, 2000, 4000],
    timeoutMs = 5000,
  }: FetchWithRetryOptions<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(url, {
        ...requestInit,
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await parseResponse(response);
    } catch (error) {
      const delay = retryDelaysMs[attempt];
      if (delay === undefined) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
