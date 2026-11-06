import { withExternalApi } from '@/lib/api/handler';
import { createClient } from '@/lib/supabase/server';
import {
  getTtsModelId,
  RETIRED_TTS_MODELS_FILTER,
  TTS_MODELS,
} from '@/lib/tts/models';

export const GET = withExternalApi(
  '/api/v1/voices',
  async (_request, { respond }) => {
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

    return respond({ data: voices }, { status: 200 });
  },
  { serverErrorMessage: 'Failed to list voices' },
);
