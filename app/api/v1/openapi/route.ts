import { updateApiKeyLastUsed, validateApiKey } from '@/lib/api/auth';
import {
  externalApiErrorResponse,
  getExternalApiRequestId,
} from '@/lib/api/external-errors';
import { createExternalApiOpenApiDocument } from '@/lib/api/openapi';
import { consumeRateLimit } from '@/lib/api/rate-limit';
import { jsonWithRateLimitHeaders } from '@/lib/api/responses';

export async function GET(request: Request) {
  const requestId = getExternalApiRequestId();
  const authHeader = request.headers.get('authorization');
  if (!authHeader) {
    return externalApiErrorResponse({
      key: 'missing_authorization_header',
      requestId,
    });
  }

  const authResult = await validateApiKey(authHeader);
  if (!authResult) {
    return externalApiErrorResponse({
      key: 'invalid_api_key',
      requestId,
    });
  }

  const rateLimit = await consumeRateLimit(authResult.keyHash);
  if (!rateLimit.allowed) {
    return externalApiErrorResponse({
      key: 'rate_limit_exceeded',
      rateLimit,
      requestId,
    });
  }

  await updateApiKeyLastUsed(authResult.keyHash);

  return jsonWithRateLimitHeaders(
    createExternalApiOpenApiDocument(),
    {
      status: 200,
    },
    rateLimit,
    requestId,
  );
}
