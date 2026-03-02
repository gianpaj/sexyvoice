import { validateApiKey } from '@/lib/api/auth';
import { EXTERNAL_API_MODELS } from '@/lib/api/constants';
import { createApiError } from '@/lib/api/errors';
import { resolveExternalModelId } from '@/lib/api/model';
import { jsonWithRateLimitHeaders } from '@/lib/api/responses';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const authResult = validateApiKey(request);
  if (!authResult.ok) {
    return jsonWithRateLimitHeaders(authResult.body, {
      status: authResult.status,
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
    );
  }
}
