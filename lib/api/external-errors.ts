import { randomUUID } from 'node:crypto';
import type { z } from 'zod';

import { createApiError } from '@/lib/api/errors';
import type { RateLimitState } from '@/lib/api/rate-limit';
import { jsonWithRateLimitHeaders } from '@/lib/api/responses';
import type { ErrorTypeSchema } from '@/lib/api/schemas';

type ErrorType = z.infer<typeof ErrorTypeSchema>;

type ExternalApiErrorKey =
  | 'missing_authorization_header'
  | 'invalid_api_key'
  | 'rate_limit_exceeded'
  | 'invalid_json'
  | 'invalid_request'
  | 'unsupported_parameter'
  | 'server_error';

interface ExternalApiErrorDefinition {
  status: number;
  type: ErrorType;
  code: string;
  message: string;
  param?: string | null;
}

const EXTERNAL_API_ERROR_DEFINITIONS: Record<
  ExternalApiErrorKey,
  ExternalApiErrorDefinition
> = {
  missing_authorization_header: {
    status: 401,
    type: 'authentication_error',
    code: 'invalid_api_key',
    message: 'Missing Authorization header',
    param: 'authorization',
  },
  invalid_api_key: {
    status: 401,
    type: 'authentication_error',
    code: 'invalid_api_key',
    message: 'Invalid API key',
    param: 'authorization',
  },
  rate_limit_exceeded: {
    status: 429,
    type: 'rate_limit_error',
    code: 'rate_limit_exceeded',
    message: 'Rate limit exceeded',
  },
  invalid_json: {
    status: 400,
    type: 'invalid_request_error',
    code: 'invalid_request',
    message: 'Invalid JSON payload',
  },
  invalid_request: {
    status: 400,
    type: 'invalid_request_error',
    code: 'invalid_request',
    message: 'Invalid request body',
  },
  unsupported_parameter: {
    status: 400,
    type: 'invalid_request_error',
    code: 'unsupported_parameter',
    message: 'Unsupported parameter',
  },
  server_error: {
    status: 500,
    type: 'server_error',
    code: 'server_error',
    message: 'Internal server error',
  },
};

const REQUEST_ID_PREFIX = 'req_sv_';

export function getExternalApiRequestId(): string {
  return `${REQUEST_ID_PREFIX}${randomUUID().replaceAll('-', '')}`;
}

export function externalApiErrorResponse(params: {
  key?: ExternalApiErrorKey;
  status?: number;
  type?: ErrorType;
  code?: string;
  message?: string;
  param?: string | null;
  rateLimit?: RateLimitState;
  requestId: string;
}) {
  const definition = params.key
    ? EXTERNAL_API_ERROR_DEFINITIONS[params.key]
    : undefined;

  return jsonWithRateLimitHeaders(
    createApiError({
      message: params.message ?? definition?.message ?? 'Internal server error',
      type: params.type ?? definition?.type ?? 'server_error',
      code: params.code ?? definition?.code ?? 'server_error',
      param: params.param ?? definition?.param ?? null,
    }),
    {
      status: params.status ?? definition?.status ?? 500,
    },
    params.rateLimit,
    params.requestId,
  );
}
