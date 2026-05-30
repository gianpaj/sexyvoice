import { z } from 'zod';

export const ErrorTypeSchema = z.enum([
  'invalid_request_error',
  'authentication_error',
  'permission_error',
  'not_found_error',
  'rate_limit_error',
  'server_error',
]);

export const ErrorResponseSchema = z.object({
  error: z.object({
    message: z.string().describe('Human-readable error description'),
    type: ErrorTypeSchema.describe('Error category'),
    param: z
      .string()
      .nullable()
      .optional()
      .describe('The parameter that caused the error, if applicable'),
    code: z.string().describe('Machine-readable error code'),
  }),
});

export const VoiceGenerationRequestSchema = z.strictObject({
  model: z.enum(['gpro', 'orpheus', 'xai']).describe('The voice model to use'),
  input: z
    .string()
    .min(1)
    .max(1000)
    .describe(
      'The text to synthesize (max 1000 chars for gpro/grok, 500 for orpheus)',
    ),
  voice: z
    .string()
    .min(1)
    .describe('Voice name (see GET /api/v1/voices for available voices)'),
  response_format: z
    .enum(['wav', 'mp3'])
    .optional()
    .describe('Audio format. Default depends on model'),
  style: z
    .string()
    .optional()
    .describe('Emotion/style variant (e.g., "happy", "sad", "whisper")'),
  seed: z
    .number()
    .int()
    .optional()
    .describe(
      'Optional deterministic seed for providers that support it (e.g. Gemini)',
    ),
});

export const VoiceGenerationRequestOpenApiSchema = z.discriminatedUnion(
  'model',
  [
    z.strictObject({
      model: z.literal('gpro').describe('The voice model to use'),
      input: z
        .string()
        .min(1)
        .max(1000)
        .describe('The text to synthesize (max 1000 chars for gpro)'),
      voice: z
        .string()
        .min(1)
        .describe('Voice name (see GET /api/v1/voices for available voices)'),
      response_format: z
        .enum(['wav', 'mp3'])
        .optional()
        .describe('Audio format. Default depends on model'),
      style: z
        .string()
        .optional()
        .describe('Emotion/style variant (e.g., "happy", "sad", "whisper")'),
      seed: z
        .number()
        .int()
        .optional()
        .describe(
          'Optional deterministic seed for providers that support it (e.g. Gemini)',
        ),
    }),
    z.strictObject({
      model: z.literal('orpheus').describe('The voice model to use'),
      input: z
        .string()
        .min(1)
        .max(500)
        .describe('The text to synthesize (max 500 chars for orpheus)'),
      voice: z
        .string()
        .min(1)
        .describe('Voice name (see GET /api/v1/voices for available voices)'),
      response_format: z
        .enum(['wav', 'mp3'])
        .optional()
        .describe('Audio format. Default depends on model'),
      style: z
        .string()
        .optional()
        .describe('Emotion/style variant (e.g., "happy", "sad", "whisper")'),
      seed: z
        .number()
        .int()
        .optional()
        .describe(
          'Optional deterministic seed for providers that support it (e.g. Gemini)',
        ),
    }),
    z.strictObject({
      model: z.literal('grok').describe('The voice model to use'),
      input: z
        .string()
        .min(1)
        .max(1000)
        .describe('The text to synthesize (max 1000 chars for grok)'),
      voice: z
        .string()
        .min(1)
        .describe('Voice name (see GET /api/v1/voices for available voices)'),
      response_format: z
        .enum(['wav', 'mp3'])
        .optional()
        .describe('Audio format. Default depends on model'),
      style: z
        .string()
        .optional()
        .describe('Emotion/style variant (e.g., "happy", "sad", "whisper")'),
      seed: z
        .number()
        .int()
        .optional()
        .describe(
          'Optional deterministic seed for providers that support it (e.g. Gemini)',
        ),
    }),
  ],
);

export const VoiceCloneRequestSchema = z
  .strictObject({
    input: z
      .string()
      .min(1)
      .max(4000)
      .describe(
        'The text to synthesize with the cloned voice (max 1000 chars on the free tier, 4000 for paid Voxtral locales, 300 for other languages)',
      ),
    locale: z
      .string()
      .min(2)
      .max(10)
      .optional()
      .describe(
        'Language of the input text (e.g. "en", "es", "fr"). Defaults to "en". Determines the cloning provider.',
      ),
    reference_audio_url: z
      .string()
      .url()
      .optional()
      .describe(
        'Public URL to the reference audio to clone (MP3, WAV, OGG/Opus). 3-25s recommended.',
      ),
    reference_audio: z
      .string()
      .min(1)
      .optional()
      .describe(
        'Base64-encoded reference audio (alternative to reference_audio_url).',
      ),
    reference_audio_format: z
      .string()
      .optional()
      .describe(
        'MIME type of the base64 reference_audio (e.g. "audio/wav", "audio/mpeg"). Defaults to audio/wav.',
      ),
    enhance_reference_audio: z
      .boolean()
      .optional()
      .describe(
        'Denoise/enhance the reference audio before cloning. Bills additional credits per second.',
      ),
    response_format: z
      .enum(['wav'])
      .optional()
      .describe(
        'Audio format of the generated output. Only "wav" is supported.',
      ),
  })
  .refine(
    (data) =>
      Boolean(data.reference_audio_url) !== Boolean(data.reference_audio),
    {
      message:
        'Provide exactly one of "reference_audio_url" or "reference_audio"',
      path: ['reference_audio_url'],
    },
  );

export const VoiceCloneResponseSchema = z.object({
  url: z.string().url().describe('URL to the generated cloned-voice audio'),
  credits_used: z
    .number()
    .int()
    .nonnegative()
    .describe('Credits consumed for this clone'),
  credits_remaining: z
    .number()
    .int()
    .nonnegative()
    .describe('Remaining credits'),
  usage: z.object({
    input_characters: z.number().int().describe('Input characters processed'),
    model: z.string().describe('Cloning model used'),
  }),
});

export const VoiceGenerationResponseSchema = z.object({
  url: z.string().url().describe('URL to generated audio'),
  credits_used: z
    .number()
    .int()
    .nonnegative()
    .describe('Credits consumed for this generation'),
  credits_remaining: z
    .number()
    .int()
    .nonnegative()
    .describe('Remaining credits'),
  usage: z.object({
    input_characters: z.number().int().describe('Input characters processed'),
    model: z.string().describe('Model used for generation'),
  }),
});

export const VoiceInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  language: z.string(),
  model: z.enum(['gpro', 'orpheus', 'grok']),
  formats: z.array(z.enum(['wav', 'mp3'])),
  supports_style: z
    .boolean()
    .describe('Whether this voice accepts the freeform `style` parameter'),
});

export const VoicesResponseSchema = z.object({
  data: z.array(VoiceInfoSchema),
});

export const ModelInfoSchema = z.object({
  id: z.enum(['gpro', 'orpheus', 'grok']),
  name: z.string(),
  max_input_length: z.number().int().positive(),
  supported_formats: z.array(z.enum(['wav', 'mp3'])),
  supported_styles: z.array(z.string()),
});

export const ModelsResponseSchema = z.object({
  data: z.array(ModelInfoSchema),
});

export const BillingTransactionSchema = z.object({
  id: z.string(),
  type: z.enum(['purchase', 'topup']),
  amount: z.number(),
  description: z.string(),
  created_at: z.string(),
  reference_id: z.string().nullable(),
  subscription_id: z.string().nullable(),
  metadata: z.unknown().nullable().optional(),
});

export const BillingResponseSchema = z.object({
  creditsLeft: z.number().int().nonnegative(),
  lastUpdated: z.string().nullable(),
  userId: z.string(),
  lastBillingTransaction: BillingTransactionSchema.nullable(),
});
