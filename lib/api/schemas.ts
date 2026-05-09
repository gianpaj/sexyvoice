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
  model: z.enum(['gpro', 'orpheus', 'grok']).describe('The voice model to use'),
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
  styles: z.array(z.string()),
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
