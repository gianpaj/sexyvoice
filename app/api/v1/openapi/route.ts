import { validateApiKey } from '@/lib/api/auth';
import { createExternalApiOpenApiDocument } from '@/lib/api/openapi';
import { jsonWithRateLimitHeaders } from '@/lib/api/responses';

export function GET(request: Request) {
  const authResult = validateApiKey(request);
  if (!authResult.ok) {
    return jsonWithRateLimitHeaders(authResult.body, {
      status: authResult.status,
    });
  }

  return jsonWithRateLimitHeaders(createExternalApiOpenApiDocument(), {
    status: 200,
  });
}
