import { withExternalApi } from '@/lib/api/handler';
import { TTS_MODEL_IDS, TTS_MODELS } from '@/lib/tts/models';

export const GET = withExternalApi(
  '/api/v1/models',
  async (_request, { respond }) =>
    respond(
      {
        data: TTS_MODEL_IDS.map((id) => ({
          id,
          max_input_length: TTS_MODELS[id].textLimit.paid,
          name: TTS_MODELS[id].name,
          supported_formats: [...TTS_MODELS[id].formats],
        })),
      },
      { status: 200 },
    ),
);
