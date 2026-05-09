import { Axiom } from '@axiomhq/js';

const axiom = new Axiom({
  token: process.env.AXIOM_TOKEN ?? '',
});

const DATASET = 'vercel';

export interface LogFields {
  apiKeyId?: string;
  cached?: boolean;
  creditsUsed?: number;
  dollarAmount?: number;
  error?: string;
  errorCode?: string;
  isGeminiVoice?: boolean;
  isGrokVoice?: boolean;
  model?: string;
  provider?: string;
  status: number;
  textLength?: number;
  userHasPaid?: boolean;
  userId?: string;
  voice?: string;
}

/**
 * Creates a logger bound to a specific request.
 *
 * The returned `log` function automatically includes `requestId`, `endpoint`,
 * and `durationMs` (computed from `startTime`) in every Axiom event, so call
 * sites only need to pass the fields that vary per log entry.
 *
 * @example
 * const log = createLogger({ requestId, endpoint: '/api/v1/speech' });
 * await log({ status: 401, errorCode: 'invalid_api_key' });
 */
export function createLogger({
  requestId,
  endpoint,
}: {
  requestId: string;
  endpoint: string;
}) {
  const startTime = Date.now();

  async function log(fields: LogFields): Promise<void> {
    axiom.ingest(DATASET, {
      requestId,
      endpoint,
      ...fields,
      durationMs: Date.now() - startTime,
    });
    // flush() errors must never propagate to callers — a logging failure
    // should never affect the HTTP response sent to the client.
    await axiom.flush().catch((err) => {
      console.error('[logger] axiom flush failed:', err);
    });
  }

  return log;
}
