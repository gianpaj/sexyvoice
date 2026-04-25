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
      message: params.message,
      type: params.type,
      param: params.param ?? null,
      code: params.code,
    },
  });
}

export function zodErrorToApiError(error: ZodError): ApiErrorBody {
  const issue = error.issues[0];
  const param = issue?.path[0];
  return createApiError({
    message: issue?.message ?? 'Invalid request body',
    type: 'invalid_request_error',
    code: 'invalid_request',
    param: typeof param === 'string' ? param : null,
  });
}
