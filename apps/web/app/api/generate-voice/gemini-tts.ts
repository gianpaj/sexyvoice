import {
  type GenerateContentConfig,
  HarmBlockThreshold,
  HarmCategory,
} from '@google/genai';

import { buildGeminiVoiceConfig } from '@/lib/tts/gemini-prompt';

export function buildGeminiTtsConfig({
  voiceName,
  model,
  seed,
  temperature,
  abortSignal,
}: {
  voiceName: string;
  model: string;
  seed?: number;
  temperature?: number;
  abortSignal: AbortSignal;
}): GenerateContentConfig {
  return {
    abortSignal,
    responseModalities: ['AUDIO'],
    ...(seed === undefined ? {} : { seed }),
    ...(temperature === undefined ? {} : { temperature }),
    safetySettings: [
      {
        category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
      },
    ],
    speechConfig: {
      voiceConfig: buildGeminiVoiceConfig(voiceName, model),
    },
  };
}
