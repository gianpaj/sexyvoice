import { updateApiKeyLastUsed, validateApiKey } from '@/lib/api/auth';
import {
  externalApiErrorResponse,
  getExternalApiRequestId,
} from '@/lib/api/external-errors';
import { consumeRateLimit } from '@/lib/api/rate-limit';
import { jsonWithRateLimitHeaders } from '@/lib/api/responses';
import { TTS_MODEL_IDS, TTS_MODELS } from '@/lib/tts/models';

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
    {
      data: TTS_MODEL_IDS.map((id) => ({
        id,
        max_input_length: TTS_MODELS[id].textLimit.paid,
        name: TTS_MODELS[id].name,
        supported_formats: [...TTS_MODELS[id].formats],
      })),
    },
    { status: 200 },
    rateLimit,
    requestId,
  );
}
