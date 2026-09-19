import type { ZodError, z } from 'zod';

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

export function zodErrorToApiError(error: ZodError): ApiErrorBody {
  const issue = error.issues[0];
  const param = issue?.path[0];
  return createApiError({
    code: 'invalid_request',
    message: issue?.message ?? 'Invalid request body',
    param: typeof param === 'string' ? param : null,
    type: 'invalid_request_error',
  });
}
