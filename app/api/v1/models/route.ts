import { validateApiKey } from '@/lib/api/auth';
import { getModelCatalogResponse } from '@/lib/api/model';
import { jsonWithRateLimitHeaders } from '@/lib/api/responses';

export function GET(request: Request) {
  const authResult = validateApiKey(request);
  if (!authResult.ok) {
    return jsonWithRateLimitHeaders(authResult.body, {
      status: authResult.status,
    });
  }

  return jsonWithRateLimitHeaders(
    {
      data: getModelCatalogResponse(),
    },
    { status: 200 },
  );
}
