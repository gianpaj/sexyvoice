import type { z } from 'zod';

import { ErrorResponseSchema, type ErrorTypeSchema } from '@/lib/api/schemas';

type ErrorType = z.infer<typeof ErrorTypeSchema>;

export interface ApiErrorBody {
  error: {
    message: string;
    type: ErrorType;
    param?: string | null;
    code: string;
  };
}

export function createApiError(params: {
  message: string;
  type: ErrorType;
  code: string;
  param?: string | null;
}): ApiErrorBody {
  return ErrorResponseSchema.parse({
    error: {
      code: params.code,
      message: params.message,
      param: params.param ?? null,
      type: params.type,
    },
  });
}
