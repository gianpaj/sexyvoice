import { z } from 'zod';

import { ModelId } from '@/data/models';

const callSessionConfigSchema = z.object({
  audioReferenceId: z.uuid().optional(),
  maxOutputTokens: z.number().nullable(),
  model: z.enum(Object.values(ModelId)),
  temperature: z.number().min(0).max(1.2),
  voice: z.string().min(1),
});

export const customCallDraftSchema = z.object({
  name: z.string().max(50),
  description: z.string().max(200),
  instructions: z.string().max(5000),
  sessionConfig: callSessionConfigSchema,
});

export const callDraftStorageKey = (userId: string) =>
  `call-draft:v1:${userId}`;
