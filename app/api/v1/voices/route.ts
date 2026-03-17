import { captureException } from '@sentry/nextjs';

import { updateApiKeyLastUsed, validateApiKey } from '@/lib/api/auth';
import { EXTERNAL_API_MODELS } from '@/lib/api/constants';
import {
  externalApiErrorResponse,
  getExternalApiRequestId,
} from '@/lib/api/external-errors';
import { resolveExternalModelId } from '@/lib/api/model';
import { consumeRateLimit } from '@/lib/api/rate-limit';
import { jsonWithRateLimitHeaders } from '@/lib/api/responses';
import { createClient } from '@/lib/supabase/server';

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

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('voices')
      .select('id, name, language, model, feature, is_public')
      .eq('feature', 'tts')
      .eq('is_public', true)
      .order('sort_order');

    if (error) {
      throw error;
    }

    return jsonWithRateLimitHeaders(
      {
        data: (data ?? []).flatMap((voice) => {
          const model = resolveExternalModelId(voice.model);
          if (!model) {
            return [];
          }
          return [
            {
              id: voice.id,
              name: voice.name,
              language: voice.language,
              model,
              formats: [...EXTERNAL_API_MODELS[model].supportedFormats],
            },
          ];
        }),
      },
      { status: 200 },
      rateLimit,
      requestId,
    );
  } catch (error) {
    captureException(error, {
      extra: {
        requestId,
        endpoint: '/api/v1/voices',
        userId: authResult.userId,
      },
    });
    return externalApiErrorResponse({
      key: 'server_error',
      message: 'Failed to list voices',
      rateLimit,
      requestId,
    });
  } finally {
    await updateApiKeyLastUsed(authResult.keyHash);
  }
}
