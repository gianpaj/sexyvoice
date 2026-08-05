export const EXTERNAL_API_MODELS = {
  gpro: {
    id: 'gpro',
    maxInputLength: 1000,
    name: 'GPro (Gemini 2.5)',
    supportedFormats: ['wav'] as const,
  },
  gpro31: {
    id: 'gpro31',
    maxInputLength: 1000,
    name: 'Gemini 3.1 Flash TTS',
    supportedFormats: ['wav'] as const,
  },
  orpheus: {
    id: 'orpheus',
    maxInputLength: 500,
    name: 'Orpheus (Replicate)',
    supportedFormats: ['mp3'] as const,
  },
  xai: {
    id: 'xai',
    maxInputLength: 1000,
    name: 'Grok (xAI)',
    supportedFormats: ['mp3', 'wav'] as const,
  },
} as const;

/**
 * Maps the full Replicate model path stored in the DB to the external API
 * model ID. Both the lucataco and gianpaj forks of Orpheus map to 'orpheus'.
 */
export const DB_MODEL_TO_EXTERNAL_ID: Record<string, string> = {
  'gianpaj/cog-orpheus-3b-0.1-ft:666dc0c400952f2c18f0a46233dca2053ebef622754769878cd5497e20714650':
    'orpheus',
  gpro: 'gpro',
  gpro31: 'gpro31',
  'lucataco/orpheus-3b-0.1-ft:79f2a473e6a9720716a473d9b2f2951437dbf91dc02ccb7079fb3d89b881207f':
    'orpheus',
  xai: 'xai',
};

export type ExternalApiModelId = keyof typeof EXTERNAL_API_MODELS;

export const RATE_LIMIT_DEFAULT = {
  requestsPerMinute: 60,
};
