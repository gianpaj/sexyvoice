import { z } from 'zod';

import { callScenes } from '@/data/call-scenes';

const sessionConfigSchema = z.object({
  model: z.string(),
  voice: z.string(),
  temperature: z.number().min(0).max(1.2),
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
  sceneInstructions: z.string().nullable().optional(),
  selectedPresetId: z.uuid().nullable(),
  selectedSceneId: z
    .enum(callScenes.map((s) => s.id) as [string, ...string[]])
    .nullable()
    .optional(),
  // Long-term memory (opt-in). When true, the agent (sexycall) preloads and
  // stores distilled facts for this user across calls. Off/absent → nothing is
  // stored.
  memory: z.boolean().optional(),
  sessionConfig: sessionConfigSchema,
});

export type CallTokenPlaygroundState = z.infer<
  typeof callTokenPlaygroundStateSchema
>;
