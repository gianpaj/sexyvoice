import { Axiom } from '@axiomhq/js';

const axiom = new Axiom({
  token: process.env.AXIOM_TOKEN ?? '',
});

const DATASET = 'sexyvoice';

export interface LogFields {
  status: number;
  errorCode?: string;
  error?: string;
  userId?: string;
  apiKeyId?: string;
  voice?: string;
  model?: string;
  textLength?: number;
  cached?: boolean;
  provider?: string;
  creditsUsed?: number;
  dollarAmount?: number;
  isGeminiVoice?: boolean;
  userHasPaid?: boolean;
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
    await axiom.flush();
  }

  return log;
}
