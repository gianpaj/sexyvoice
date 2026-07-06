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

const ExternalApiModelSchema = z.enum(['gpro', 'gpro31', 'orpheus', 'xai']);

export const VoiceGenerationRequestSchema = z
  .strictObject({
    model: ExternalApiModelSchema.optional().describe(
      'The voice model to use when selecting a voice by name. Omit when using voiceId.',
    ),
    input: z
      .string()
      .min(1)
      .max(1000)
      .describe(
        'The text to synthesize (max 1000 chars for gpro/gpro31/xai, 500 for orpheus)',
      ),
    voice: z
      .string()
      .min(1)
      .optional()
      .describe(
        'Voice name. Use with model, or pass voiceId instead. See GET /api/v1/voices for available voices.',
      ),
    voiceId: z
      .string()
      .min(1)
      .optional()
      .describe(
        'Voice ID from GET /api/v1/voices. Use instead of voice + model.',
      ),
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
    temperature: z
      .number()
      .min(0)
      .max(2)
      .optional()
      .describe(
        'Sampling temperature for Gemini voices (gpro/gpro31). Range 0-2; higher is more expressive. Ignored by other models.',
      ),
    speed: z
      .number()
      .min(0.7)
      .max(1.5)
      .optional()
      .describe(
        'Speech speed multiplier for Grok (xai) voices. Range 0.7-1.5. Ignored by other models.',
      ),
  })
  .superRefine((data, ctx) => {
    const hasVoiceId = data.voiceId !== undefined;
    const hasVoice = data.voice !== undefined;
    const hasModel = data.model !== undefined;

    if (hasVoiceId && (hasVoice || hasModel)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Use either voiceId or voice + model, not both',
        path: ['voiceId'],
      });
      return;
    }

    if (!(hasVoiceId || hasVoice)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Required when voiceId is not provided',
        path: ['voice'],
      });
    }

    if (!(hasVoiceId || hasModel)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Required when voiceId is not provided',
        path: ['model'],
      });
    }
  });

export const VoiceGenerationRequestOpenApiSchema = VoiceGenerationRequestSchema;

export const VoiceGenerationResponseSchema = z.object({
  url: z.url().describe('URL to generated audio'),
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
  model: z.enum(['gpro', 'gpro31', 'orpheus', 'xai']),
  formats: z.array(z.enum(['wav', 'mp3'])),
  supports_style: z
    .boolean()
    .describe('Whether this voice accepts the freeform `style` parameter'),
});

export const VoicesResponseSchema = z.object({
  data: z.array(VoiceInfoSchema),
});

export const ModelInfoSchema = z.object({
  id: z.enum(['gpro', 'gpro31', 'orpheus', 'xai']),
  name: z.string(),
  max_input_length: z.number().int().positive(),
  supported_formats: z.array(z.enum(['wav', 'mp3'])),
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
