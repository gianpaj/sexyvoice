/**
 * Minimal xAI Batch API client (upload JSONL -> create batch -> poll state ->
 * page results). See https://docs.x.ai/developers/advanced-api-usage/batch-api
 *
 * Shared by the web app (`/api/call-sessions/analyze/batch`) and the
 * operational scripts in `scripts/`, so it only uses `fetch`/`FormData` and
 * reads its configuration from the environment.
 */

// Base host only; request paths below include the /v1 prefix (matches the
// documented curl, e.g. https://api.x.ai/v1/files). Trailing slashes are
// stripped so an override with or without one both resolve correctly.
function getApiBase(): string {
  return (process.env.XAI_API_BASE_URL || 'https://api.x.ai').replace(
    /\/+$/,
    '',
  );
}

function getApiKey(): string {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    throw new Error('Missing env.XAI_API_KEY');
  }
  return apiKey;
}

export interface XaiBatchState {
  num_cancelled?: number;
  num_error?: number;
  num_pending?: number;
  num_requests?: number;
  num_success?: number;
}

/** One parsed line of a batch result page. */
export interface XaiBatchOutcome {
  content: string | null;
  customId: string | null;
  errorMessage: string | null;
}

export interface XaiChatCompletionBatchRequest {
  body: {
    messages: Array<{ content: string; role: 'system' | 'user' }>;
    model: string;
  };
  custom_id: string;
  method: 'POST';
  url: '/v1/chat/completions';
}

async function xaiApiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${getApiBase()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      ...(init.headers || {}),
    },
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(
      `xAI ${init.method || 'GET'} ${path} failed: ${response.status} ${response.statusText}${
        detail ? ` - ${detail}` : ''
      }`,
    );
  }
  return response.json() as Promise<T>;
}

/** Serialise chat-completion requests into the JSONL body the Files API expects. */
export function toBatchJsonl(
  requests: XaiChatCompletionBatchRequest[],
): string {
  return `${requests.map((request) => JSON.stringify(request)).join('\n')}\n`;
}

// Upload the JSONL request file. Follows the documented curl (single `file`
// multipart field); FormData sets the multipart Content-Type + boundary.
export async function uploadBatchInputFile(
  jsonl: string,
  filename: string,
): Promise<string> {
  const form = new FormData();
  form.append(
    'file',
    new Blob([jsonl], { type: 'application/jsonl' }),
    filename,
  );
  const data = await xaiApiFetch<{
    file?: { id?: string };
    file_id?: string;
    id?: string;
  }>('/v1/files', { body: form, method: 'POST' });
  const fileId = data.id || data.file_id || data.file?.id;
  if (!fileId) {
    throw new Error(`xAI file upload returned no id: ${JSON.stringify(data)}`);
  }
  return fileId;
}

export async function createBatch(
  name: string,
  inputFileId: string,
): Promise<string> {
  const data = await xaiApiFetch<{ batch_id?: string; id?: string }>(
    '/v1/batches',
    {
      body: JSON.stringify({ input_file_id: inputFileId, name }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    },
  );
  const batchId = data.batch_id || data.id;
  if (!batchId) {
    throw new Error(
      `xAI batch creation returned no id: ${JSON.stringify(data)}`,
    );
  }
  return batchId;
}

export async function getBatchState(batchId: string): Promise<XaiBatchState> {
  const batch = await xaiApiFetch<XaiBatchState & { state?: XaiBatchState }>(
    `/v1/batches/${batchId}`,
  );
  return batch.state || batch || {};
}

/**
 * A batch is settled once xAI has registered its requests and none are still
 * pending. Guards against the create->parse window where every counter is 0.
 */
export function isBatchSettled(state: XaiBatchState): boolean {
  const pending = state.num_pending ?? 0;
  const settled =
    (state.num_success ?? 0) +
    (state.num_error ?? 0) +
    (state.num_cancelled ?? 0);
  const registered = (state.num_requests ?? 0) > 0 || settled > 0;
  return registered && pending === 0;
}

// The docs show the result shape for the inline batch_requests style; the
// file-based /v1/chat/completions style may come back OpenAI-shaped. Probe both.
interface RawChatCompletion {
  choices?: Array<{ message?: { content?: unknown } }>;
  error?: { message?: unknown };
}

interface RawBatchResult {
  batch_request_id?: unknown;
  batch_result?: { response?: RawBatchResponse };
  custom_id?: unknown;
  error?: { message?: unknown } | string;
  error_message?: unknown;
  response?: RawBatchResponse;
}

interface RawBatchResponse extends RawChatCompletion {
  body?: RawChatCompletion;
  chat_get_completion?: RawChatCompletion;
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function firstChoiceContent(completion: RawChatCompletion | undefined) {
  return asNullableString(completion?.choices?.[0]?.message?.content);
}

export function extractBatchOutcome(result: unknown): XaiBatchOutcome {
  const raw = (result ?? {}) as RawBatchResult;
  const customId =
    asNullableString(raw.custom_id) ?? asNullableString(raw.batch_request_id);
  const response = raw.response ?? raw.batch_result?.response;
  const errorMessage =
    asNullableString(raw.error_message) ??
    (typeof raw.error === 'string'
      ? asNullableString(raw.error)
      : asNullableString(raw.error?.message)) ??
    asNullableString(response?.body?.error?.message);

  const content =
    firstChoiceContent(response?.body) ??
    firstChoiceContent(response?.chat_get_completion) ??
    firstChoiceContent(response);

  return { content, customId, errorMessage };
}

/** Fetch every result page and index the outcomes by `custom_id`. */
export async function getBatchOutcomes(
  batchId: string,
): Promise<Map<string, XaiBatchOutcome>> {
  const outcomes = new Map<string, XaiBatchOutcome>();
  let paginationToken: string | null = null;
  do {
    const query = new URLSearchParams({ limit: '100' });
    if (paginationToken) {
      query.set('pagination_token', paginationToken);
    }
    const page: { pagination_token?: string; results?: unknown[] } =
      await xaiApiFetch(`/v1/batches/${batchId}/results?${query}`);
    for (const raw of page.results ?? []) {
      const outcome = extractBatchOutcome(raw);
      if (outcome.customId) {
        outcomes.set(outcome.customId, outcome);
      }
    }
    paginationToken = page.pagination_token || null;
  } while (paginationToken);
  return outcomes;
}

export interface WaitForBatchOptions {
  /** Called on every poll with the latest state (progress logging). */
  onPoll?: (state: XaiBatchState) => void;
  pollIntervalMs?: number;
  /** Give up after this long; returns the last state with `settled: false`. */
  timeoutMs: number;
}

/** Poll until the batch settles or the time budget is spent. */
export async function waitForBatch(
  batchId: string,
  { onPoll, pollIntervalMs = 5000, timeoutMs }: WaitForBatchOptions,
): Promise<{ settled: boolean; state: XaiBatchState }> {
  const startedAt = Date.now();
  for (;;) {
    const state = await getBatchState(batchId);
    onPoll?.(state);
    if (isBatchSettled(state)) {
      return { settled: true, state };
    }
    if (Date.now() - startedAt + pollIntervalMs > timeoutMs) {
      return { settled: false, state };
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
}
