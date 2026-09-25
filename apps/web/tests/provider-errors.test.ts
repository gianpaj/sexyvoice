import { describe, expect, it } from 'vitest';

import {
  getProviderUnavailableMessage,
  PROVIDER_UNAVAILABLE_TEMPLATE,
} from '@/lib/errors/provider-unavailable-message';
import { resolveErrorMessage } from '@/lib/errors/resolve-error-message';
import {
  CONTENT_REFUSAL_STATUS_CODE,
  formatProviderDisplayName,
  getProviderUnavailableDetails,
  isContentRefusalText,
  isProviderContentRefusal,
  isProviderDisplayName,
  isProviderId,
  isTransientProviderFailure,
} from '@/lib/provider-errors';
import messages from '@/messages/en.json';

const providers = [
  ['gemini', 'Gemini'],
  ['grok', 'Grok'],
  ['mistral', 'Mistral'],
  ['replicate', 'Replicate'],
] as const;

function createTranslator(hasKey = true) {
  return Object.assign(
    (_key: 'PROVIDER_UNAVAILABLE', details: Record<string, string>) =>
      `${details.provider} is unavailable in this locale.`,
    {
      has: (_key: 'PROVIDER_UNAVAILABLE') => hasKey,
    },
  );
}

describe('provider metadata', () => {
  it.each(providers)('validates and formats %s', (providerId, displayName) => {
    expect(isProviderId(providerId)).toBe(true);
    expect(formatProviderDisplayName(providerId)).toBe(displayName);
    expect(isProviderDisplayName(displayName)).toBe(true);
    expect(getProviderUnavailableDetails(providerId)).toEqual({
      provider: displayName,
    });
  });

  it.each(['google', 'xai', '', null, undefined])(
    'rejects unsupported provider %s',
    (provider) => {
      expect(isProviderId(provider)).toBe(false);
      expect(formatProviderDisplayName(provider)).toBeNull();
      expect(isProviderDisplayName(provider)).toBe(false);
    },
  );
});

describe('isProviderContentRefusal', () => {
  const refusalBody = JSON.stringify({
    code: 'permission-denied',
    error: "I can't help with that request.",
  });

  function apiCallError(overrides: Record<string, unknown>) {
    return Object.assign(
      new Error("permission-denied: I can't help with that request."),
      { name: 'AI_APICallError', ...overrides },
    );
  }

  it('matches the recorded AI_APICallError shape with responseBody and 403', () => {
    const error = apiCallError({
      isRetryable: false,
      responseBody: refusalBody,
      statusCode: CONTENT_REFUSAL_STATUS_CODE,
    });
    expect(isProviderContentRefusal(error)).toBe(true);
    // A refusal is disjoint from a transient failure.
    expect(isTransientProviderFailure(error)).toBe(false);
  });

  it('matches a 403 whose message carries the markers but has no responseBody', () => {
    expect(
      isProviderContentRefusal(
        apiCallError({ statusCode: CONTENT_REFUSAL_STATUS_CODE }),
      ),
    ).toBe(true);
  });

  it('rejects a 403 without the refusal markers (e.g. a bad API key)', () => {
    expect(
      isProviderContentRefusal(
        Object.assign(new Error('Invalid API key'), {
          responseBody: JSON.stringify({ code: 'invalid_request' }),
          statusCode: CONTENT_REFUSAL_STATUS_CODE,
        }),
      ),
    ).toBe(false);
  });

  it.each([500, 429])(
    'rejects status %s even with the refusal markers',
    (statusCode) => {
      const error = apiCallError({ responseBody: refusalBody, statusCode });
      expect(isProviderContentRefusal(error)).toBe(false);
    },
  );

  it('rejects a plain Error carrying the markers but no status', () => {
    expect(
      isProviderContentRefusal(
        new Error("permission-denied: I can't help with that request."),
      ),
    ).toBe(false);
  });

  it.each([null, undefined, "permission-denied: can't help with that request"])(
    'rejects the non-error value %s',
    (value) => {
      expect(isProviderContentRefusal(value)).toBe(false);
    },
  );
});

describe('isContentRefusalText', () => {
  it.each([
    "permission-denied: I can't help with that request.",
    'I cannot help with that request.',
    '{"code":"permission-denied","error":"I can\'t help with that request."}',
  ])('matches the refusal text %s', (text) => {
    expect(isContentRefusalText(text)).toBe(true);
  });

  it.each(['rate limited', 'parse failed: bad json', null, undefined, 42])(
    'does not match the normal value %s',
    (value) => {
      expect(isContentRefusalText(value)).toBe(false);
    },
  );
});

describe('getProviderUnavailableMessage', () => {
  it('matches the English locale catalog', () => {
    expect(messages.errorCodes.PROVIDER_UNAVAILABLE).toBe(
      PROVIDER_UNAVAILABLE_TEMPLATE,
    );
  });

  it.each(providers)(
    'formats the English fallback for %s',
    (providerId, displayName) => {
      expect(getProviderUnavailableMessage(providerId)).toBe(
        `${displayName} is temporarily unavailable. Please retry.`,
      );
    },
  );
});

describe('resolveErrorMessage', () => {
  const serverFallback = 'Gemini is temporarily unavailable. Please retry.';

  it('returns a translated provider error', () => {
    expect(
      resolveErrorMessage(
        createTranslator(),
        'PROVIDER_UNAVAILABLE',
        { provider: 'Gemini' },
        serverFallback,
      ),
    ).toBe('Gemini is unavailable in this locale.');
  });

  it('returns the server fallback for an unknown code', () => {
    expect(
      resolveErrorMessage(
        createTranslator(),
        'UNKNOWN_ERROR',
        { provider: 'Gemini' },
        serverFallback,
      ),
    ).toBe(serverFallback);
  });

  it('returns the server fallback when provider details are missing', () => {
    expect(
      resolveErrorMessage(
        createTranslator(),
        'PROVIDER_UNAVAILABLE',
        {},
        serverFallback,
      ),
    ).toBe(serverFallback);
  });

  it('returns the server fallback when the translation is unavailable', () => {
    expect(
      resolveErrorMessage(
        createTranslator(false),
        'PROVIDER_UNAVAILABLE',
        { provider: 'Gemini' },
        serverFallback,
      ),
    ).toBe(serverFallback);
  });
});
