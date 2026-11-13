import { captureException } from '@sentry/nextjs';

import { updateApiKeyLastUsed, validateApiKey } from '@/lib/api/auth';
import {
  externalApiErrorResponse,
  getExternalApiRequestId,
} from '@/lib/api/external-errors';
import { createLogger } from '@/lib/api/logger';
import { consumeRateLimit, type RateLimitState } from '@/lib/api/rate-limit';
import { jsonWithRateLimitHeaders } from '@/lib/api/responses';

interface ExternalApiContext {
  auth: NonNullable<Awaited<ReturnType<typeof validateApiKey>>>;
  log: ReturnType<typeof createLogger>;
  rateLimit: RateLimitState;
  requestId: string;
  /** JSON response carrying the rate-limit and `request-id` headers. */
  respond: (body: unknown, init?: ResponseInit) => Response;
}

/**
 * An API-key authenticated `/api/v1` route. Validates the bearer key,
 * consumes the per-key rate limit, records the key's last use and turns
 * unexpected errors into a logged `server_error`.
 */
export function withExternalApi(
  endpoint: string,
  handler: (request: Request, context: ExternalApiContext) => Promise<Response>,
  { serverErrorMessage }: { serverErrorMessage?: string } = {},
) {
  return async (request: Request): Promise<Response> => {
    const requestId = getExternalApiRequestId();
    const log = createLogger({ endpoint, requestId });

    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      await log({ errorCode: 'missing_authorization_header', status: 401 });
      return externalApiErrorResponse({
        key: 'missing_authorization_header',
        requestId,
      });
    }

    const auth = await validateApiKey(authHeader);
    if (!auth) {
      await log({ errorCode: 'invalid_api_key', status: 401 });
      return externalApiErrorResponse({ key: 'invalid_api_key', requestId });
    }

    const rateLimit = await consumeRateLimit(auth.keyHash);
    if (!rateLimit.allowed) {
      await log({
        apiKeyId: auth.apiKeyId,
        errorCode: 'rate_limit_exceeded',
        status: 429,
        userId: auth.userId,
      });
      return externalApiErrorResponse({
        key: 'rate_limit_exceeded',
        rateLimit,
        requestId,
      });
    }

    try {
      return await handler(request, {
        auth,
        log,
        rateLimit,
        requestId,
        respond: (body, init = {}) =>
          jsonWithRateLimitHeaders(body, init, rateLimit, requestId),
      });
    } catch (error) {
      captureException(error, {
        extra: {
          apiKeyId: auth.apiKeyId,
          endpoint,
          requestId,
          userId: auth.userId,
        },
      });
      await log({
        apiKeyId: auth.apiKeyId,
        error: error instanceof Error ? error.message : String(error),
        errorCode: 'server_error',
        status: 500,
        userId: auth.userId,
      });
      return externalApiErrorResponse({
        key: 'server_error',
        message: serverErrorMessage,
        rateLimit,
        requestId,
      });
    } finally {
      await updateApiKeyLastUsed(auth.keyHash);
    }
  };
}
