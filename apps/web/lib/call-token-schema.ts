import { z } from 'zod';

import { callScenes } from '@/data/call-scenes';
import { normalizeModelId } from '@/data/models';

const sessionConfigSchema = z.object({
  audioReferenceId: z.uuid().optional(),
  maxOutputTokens: z.number().nullable(),
  // Normalized at the trust boundary: this value is forwarded verbatim into the
  // LiveKit token metadata and is what the agent runs on, while credits are
  // charged at the current rate. A stale tab or a shared URL carrying a retired
  // id must not be able to run an old model at the new price.
  model: z.string().transform(normalizeModelId),
  temperature: z.number().min(0).max(1.2),
  voice: z.string(),
});

export const callTokenPlaygroundStateSchema = z.object({
  clientTime: z.iso.datetime({ offset: true }).optional().catch(undefined),
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
  // The saved profile preference applies even when the client requests memory.
  memory: z.boolean().default(true),
  sceneInstructions: z.string().nullable().optional(),
  selectedPresetId: z.uuid().nullable(),
  selectedSceneId: z
    .enum(callScenes.map((s) => s.id) as [string, ...string[]])
    .nullable()
    .optional(),
  sessionConfig: sessionConfigSchema,
  timeZone: z
    .string()
    .max(100)
    .refine((value) => {
      try {
        Intl.DateTimeFormat('en', { timeZone: value });
        return true;
      } catch {
        return false;
      }
    })
    .optional()
    .catch(undefined),
});

export type CallTokenPlaygroundState = z.infer<
  typeof callTokenPlaygroundStateSchema
>;
