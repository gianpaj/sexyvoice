import { z } from 'zod';

export const sessionConfigSchema = z.object({
  model: z.string(),
  voice: z.string(),
  temperature: z.number().min(0.6).max(1.2),
  maxOutputTokens: z.number().nullable(),
});

export const callTokenPlaygroundStateSchema = z.object({
  instructions: z.string(),
  language: z
    .enum([
      'ar',
      'cs',
      'da',
      'de',
      'en',
      'es',
      'fi',
      'fr',
      'hi',
      'it',
      'ja',
      'ko',
      'nl',
      'no',
      'pl',
      'pt',
      'ru',
      'sv',
      'tr',
      'zh',
    ] as const)
    .optional(),
  selectedPresetId: z.uuid().nullable(),
  sessionConfig: sessionConfigSchema,
});

export type CallTokenPlaygroundState = z.infer<
  typeof callTokenPlaygroundStateSchema
>;
