import { z } from 'zod';

import { callScenes } from '@/data/call-scenes';
import { normalizeModelId } from '@/data/models';

const sessionConfigSchema = z.object({
  // Normalized at the trust boundary: this value is forwarded verbatim into the
  // LiveKit token metadata and is what the agent runs on, while credits are
  // charged at the current rate. A stale tab or a shared URL carrying a retired
  // id must not be able to run an old model at the new price.
  model: z.string().transform(normalizeModelId),
  voice: z.string(),
  temperature: z.number().min(0).max(1.2),
  maxOutputTokens: z.number().nullable(),
  // Present when model is 'inworld-realtime' — an audio_references row id.
  audioReferenceId: z.string().nullable().optional(),
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
