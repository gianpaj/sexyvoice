export const EXTERNAL_API_MODELS = {
  gpro: {
    id: 'gpro',
    name: 'GPro (Gemini)',
    maxInputLength: 1000,
    supportedFormats: ['wav'] as const,
  },
  kokoro: {
    id: 'kokoro',
    name: 'Kokoro (Replicate)',
    maxInputLength: 500,
    supportedFormats: ['mp3'] as const,
  },
} as const;

export type ExternalApiModelId = keyof typeof EXTERNAL_API_MODELS;

export const RATE_LIMIT_DEFAULT = {
  requestsPerMinute: 60,
};
