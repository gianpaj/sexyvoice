export const EXTERNAL_API_MODELS = {
  gpro: {
    id: 'gpro',
    name: 'GPro (Gemini)',
    maxInputLength: 1000,
    supportedFormats: ['wav'] as const,
  },
  orpheus: {
    id: 'orpheus',
    name: 'Orpheus (Replicate)',
    maxInputLength: 500,
    supportedFormats: ['mp3'] as const,
  },
  xai: {
    id: 'grok',
    name: 'Grok (xAI)',
    maxInputLength: 1000,
    supportedFormats: ['mp3', 'wav'] as const,
  },
} as const;

/**
 * Maps the full Replicate model path stored in the DB to the external API
 * model ID. Both the lucataco and gianpaj forks of Orpheus map to 'orpheus'.
 */
export const DB_MODEL_TO_EXTERNAL_ID: Record<string, string> = {
  gpro: 'gpro',
  'lucataco/orpheus-3b-0.1-ft:79f2a473e6a9720716a473d9b2f2951437dbf91dc02ccb7079fb3d89b881207f':
    'orpheus',
  'gianpaj/cog-orpheus-3b-0.1-ft:666dc0c400952f2c18f0a46233dca2053ebef622754769878cd5497e20714650':
    'orpheus',
  xai: 'xai',
};

export type ExternalApiModelId = keyof typeof EXTERNAL_API_MODELS;

export const RATE_LIMIT_DEFAULT = {
  requestsPerMinute: 60,
};
