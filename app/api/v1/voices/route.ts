import { updateApiKeyLastUsed, validateApiKey } from '@/lib/api/auth';
import { EXTERNAL_API_MODELS } from '@/lib/api/constants';
import { createApiError } from '@/lib/api/errors';
import { resolveExternalModelId } from '@/lib/api/model';
import { consumeRateLimit } from '@/lib/api/rate-limit';
import { jsonWithRateLimitHeaders } from '@/lib/api/responses';
import { createClient } from '@/lib/supabase/server';

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
        data: (data ?? []).map((voice) => {
          const model = resolveExternalModelId(voice.model);
          return {
            id: voice.id,
            name: voice.name,
            language: voice.language,
            model,
            formats: [...EXTERNAL_API_MODELS[model].supportedFormats],
            styles: [...EXTERNAL_API_MODELS[model].supportedStyles],
          };
        }),
      },
      { status: 200 },
      rateLimit,
    );
  } catch (error) {
    console.error(error);
    return jsonWithRateLimitHeaders(
      createApiError({
        message: 'Failed to list voices',
        type: 'server_error',
        code: 'server_error',
      }),
      { status: 500 },
      rateLimit,
    );
  } finally {
    await updateApiKeyLastUsed(authResult.keyHash);
  }
}
