import { createApiError } from '@/lib/api/errors';

function parseConfiguredApiKeys() {
  const configured =
    process.env.EXTERNAL_API_KEYS || process.env.EXTERNAL_API_KEY;
  if (!configured) {
    return [];
  }
  return configured
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function extractApiKey(request: Request) {
  const xApiKey = request.headers.get('x-api-key');
  if (xApiKey) {
    return xApiKey.trim();
  }

  const authHeader = request.headers.get('authorization');
  if (!authHeader) {
    return null;
  }

  const [scheme, token] = authHeader.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return null;
  }

  return token.trim();
}

export function validateApiKey(request: Request) {
  const configuredKeys = parseConfiguredApiKeys();
  if (configuredKeys.length === 0) {
    return {
      ok: false,
      status: 500,
      body: createApiError({
        message: 'External API key is not configured on the server environment',
        type: 'server_error',
        code: 'server_error',
      }),
    } as const;
  }

  const incomingKey = extractApiKey(request);
  if (!incomingKey) {
    return {
      ok: false,
      status: 401,
      body: createApiError({
        message: 'Missing API key',
        type: 'authentication_error',
        param: 'x-api-key',
        code: 'invalid_api_key',
      }),
    } as const;
  }

  if (!configuredKeys.includes(incomingKey)) {
    return {
      ok: false,
      status: 401,
      body: createApiError({
        message: 'Invalid API key',
        type: 'authentication_error',
        param: 'x-api-key',
        code: 'invalid_api_key',
      }),
    } as const;
  }

  return { ok: true } as const;
}
