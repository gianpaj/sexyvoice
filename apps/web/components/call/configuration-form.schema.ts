import type { UseFormReturn } from 'react-hook-form';
import { z } from 'zod';

import { ModelId } from '@/data/models';

export const ConfigurationFormSchema = z.object({
  model: z.enum(Object.values(ModelId)),
  voice: z.string().min(1),
  temperature: z.number().min(0).max(1.2),
  maxOutputTokens: z.number().nullable(),
});

export interface ConfigurationFormFieldProps {
  form: UseFormReturn<z.infer<typeof ConfigurationFormSchema>>;
  schema?: typeof ConfigurationFormSchema;
}
