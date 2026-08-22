import type { UseFormReturn } from 'react-hook-form';
import { z } from 'zod';

import { ModelId } from '@/data/models';

export const ConfigurationFormSchema = z.object({
  maxOutputTokens: z.number().nullable(),
  model: z.enum(Object.values(ModelId)),
  temperature: z.number().min(0).max(1.2),
  voice: z.string().min(1),
});

export interface ConfigurationFormFieldProps {
  form: UseFormReturn<z.infer<typeof ConfigurationFormSchema>>;
  schema?: typeof ConfigurationFormSchema;
}
