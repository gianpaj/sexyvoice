import { updateApiKeyLastUsed, validateApiKey } from '@/lib/api/auth';
import { createApiError } from '@/lib/api/errors';
import { getModelCatalogResponse } from '@/lib/api/model';
import { consumeRateLimit } from '@/lib/api/rate-limit';
import { jsonWithRateLimitHeaders } from '@/lib/api/responses';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) {
    return jsonWithRateLimitHeaders(
      createApiError({
        message: 'Missing Authorization header',
        type: 'authentication_error',
        code: 'invalid_api_key',
        param: 'authorization',
      }),
      { status: 401 },
    );
  }

  const authResult = await validateApiKey(authHeader);
  if (!authResult) {
    return jsonWithRateLimitHeaders(
      createApiError({
        message: 'Invalid API key',
        type: 'authentication_error',
        code: 'invalid_api_key',
        param: 'authorization',
      }),
      { status: 401 },
    );
  }

  const rateLimit = await consumeRateLimit(authResult.keyHash);
  if (!rateLimit.allowed) {
    return jsonWithRateLimitHeaders(
      createApiError({
        message: 'Rate limit exceeded',
        type: 'rate_limit_error',
        code: 'rate_limit_exceeded',
      }),
      { status: 429 },
      rateLimit,
    );
  }

  await updateApiKeyLastUsed(authResult.keyHash);

  return jsonWithRateLimitHeaders(
    {
      data: getModelCatalogResponse(),
    },
    { status: 200 },
    rateLimit,
  );
}
