import { randomUUID } from 'node:crypto';
import type { z } from 'zod';

import { createApiError } from '@/lib/api/errors';
import type { RateLimitState } from '@/lib/api/rate-limit';
import { jsonWithRateLimitHeaders } from '@/lib/api/responses';
import type { ErrorTypeSchema } from '@/lib/api/schemas';

type ErrorType = z.infer<typeof ErrorTypeSchema>;

interface ExternalApiErrorDefinition {
  code: string;
  meaning?: string;
  message: string;
  param?: string | null;
  status: number;
  type: ErrorType;
}

export const EXTERNAL_API_ERROR_DEFINITIONS = {
  content_policy_violation: {
    code: 'content_policy_violation',
    meaning: 'A provider blocked the content.',
    message: 'Content generation prohibited.',
    status: 422,
    type: 'invalid_request_error',
  },
  input_too_long: {
    code: 'input_too_long',
    meaning:
      'Effective text exceeds the model or account limit, including Gemini style.',
    message: 'The input text exceeds the maximum length.',
    param: 'input',
    status: 400,
    type: 'invalid_request_error',
  },
  insufficient_credits: {
    code: 'insufficient_credits',
    meaning: 'The account does not have enough credits for generation.',
    message: 'Insufficient credits',
    status: 402,
    type: 'permission_error',
  },
  invalid_api_key: {
    code: 'invalid_api_key',
    meaning: 'The Bearer key is missing, invalid, revoked, or expired.',
    message: 'Invalid API key',
    param: 'authorization',
    status: 401,
    type: 'authentication_error',
  },
  invalid_json: {
    code: 'invalid_request',
    message: 'Invalid JSON payload',
    status: 400,
    type: 'invalid_request_error',
  },
  invalid_request: {
    code: 'invalid_request',
    meaning: 'Malformed JSON, missing or unknown fields, or invalid values.',
    message: 'Invalid request body',
    status: 400,
    type: 'invalid_request_error',
  },
  missing_authorization_header: {
    code: 'invalid_api_key',
    message: 'Missing Authorization header',
    param: 'authorization',
    status: 401,
    type: 'authentication_error',
  },
  no_audio: {
    code: 'server_error',
    meaning: 'Gemini returned no audio. Retry with backoff.',
    message: 'Voice generation returned no audio, please retry',
    status: 503,
    type: 'server_error',
  },
  output_limit_exceeded: {
    code: 'output_limit_exceeded',
    meaning:
      'Gemini reached its audio output limit. Shorten the input before retrying.',
    message: 'The voice reached its audio output limit.',
    status: 422,
    type: 'invalid_request_error',
  },
  provider_quota_exceeded: {
    code: 'provider_quota_exceeded',
    meaning: 'Gemini quota or billing is temporarily exhausted.',
    message: 'The upstream provider reached its quota.',
    status: 429,
    type: 'rate_limit_error',
  },
  provider_unavailable: {
    code: 'provider_unavailable',
    meaning:
      'The upstream service is temporarily unavailable or timed out. Retry with backoff.',
    message: 'The upstream service is temporarily unavailable.',
    status: 503,
    type: 'server_error',
  },
  rate_limit_exceeded: {
    code: 'rate_limit_exceeded',
    meaning: 'The API key has reached its shared request limit.',
    message: 'Rate limit exceeded',
    status: 429,
    type: 'rate_limit_error',
  },
  server_error: {
    code: 'server_error',
    meaning: 'Internal service or provider failure.',
    message: 'Internal server error',
    status: 500,
    type: 'server_error',
  },
  unsupported_response_format: {
    code: 'unsupported_response_format',
    meaning: 'The model does not return the requested format.',
    message: 'Unsupported response format.',
    param: 'response_format',
    status: 400,
    type: 'invalid_request_error',
  },
  voice_not_found: {
    code: 'voice_not_found',
    meaning:
      'The voice ID is unavailable or the name does not exist for the requested model.',
    message: 'Voice not found',
    status: 404,
    type: 'not_found_error',
  },
} as const satisfies Record<string, ExternalApiErrorDefinition>;

export type ExternalApiErrorKey = keyof typeof EXTERNAL_API_ERROR_DEFINITIONS;

const REQUEST_ID_PREFIX = 'req_sv_';

export function getExternalApiRequestId(): string {
  return `${REQUEST_ID_PREFIX}${randomUUID().replaceAll('-', '')}`;
}

export function externalApiErrorResponse(params: {
  key: ExternalApiErrorKey;
  message?: string;
  param?: string | null;
  rateLimit?: RateLimitState;
  requestId: string;
}) {
  const definition: ExternalApiErrorDefinition =
    EXTERNAL_API_ERROR_DEFINITIONS[params.key];

  return jsonWithRateLimitHeaders(
    createApiError({
      code: definition.code,
      message: params.message ?? definition.message,
      param: params.param === undefined ? definition.param : params.param,
      type: definition.type,
    }),
    {
      status: definition.status,
    },
    params.rateLimit,
    params.requestId,
  );
}
