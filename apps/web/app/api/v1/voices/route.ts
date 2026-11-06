import { captureException } from '@sentry/nextjs';

import { updateApiKeyLastUsed, validateApiKey } from '@/lib/api/auth';
import {
  externalApiErrorResponse,
  getExternalApiRequestId,
} from '@/lib/api/external-errors';
import { consumeRateLimit } from '@/lib/api/rate-limit';
import { jsonWithRateLimitHeaders } from '@/lib/api/responses';
import { createClient } from '@/lib/supabase/server';
import {
  getTtsModelId,
  RETIRED_TTS_MODELS_FILTER,
  TTS_MODELS,
} from '@/lib/tts/models';

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
      .not('model', 'in', RETIRED_TTS_MODELS_FILTER)
      .eq('is_public', true)
      .order('sort_order')
      .order('name');

    if (error) {
      throw error;
    }

    const voices = (data ?? []).flatMap((voice) => {
      const model = getTtsModelId(voice.model);
      if (!model) {
        return [];
      }
      return [
        {
          formats: [...TTS_MODELS[model].formats],
          id: voice.id,
          language: voice.language,
          model,
          name: voice.name,
          supports_style: TTS_MODELS[model].styleLimit !== null,
        },
      ];
    });

    return jsonWithRateLimitHeaders(
      { data: voices },
      { status: 200 },
      rateLimit,
      requestId,
    );
  } catch (error) {
    captureException(error, {
      extra: {
        endpoint: '/api/v1/voices',
        requestId,
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
