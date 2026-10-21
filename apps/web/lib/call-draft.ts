import { z } from 'zod';

import { ConfigurationFormSchema } from '@/components/call/configuration-form.schema';

export const customCallDraftSchema = z.object({
  name: z.string().max(50),
  description: z.string().max(200),
  instructions: z.string().max(5000),
  sessionConfig: ConfigurationFormSchema,
});

export const callDraftStorageKey = (userId: string) =>
  `call-draft:v1:${userId}`;
