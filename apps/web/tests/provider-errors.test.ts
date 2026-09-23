import { describe, expect, it } from 'vitest';

import {
  getProviderUnavailableMessage,
  PROVIDER_UNAVAILABLE_TEMPLATE,
} from '@/lib/errors/provider-unavailable-message';
import { resolveErrorMessage } from '@/lib/errors/resolve-error-message';
import {
  formatProviderDisplayName,
  getProviderUnavailableDetails,
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
  // Shape recorded from the Sentry event: an AI SDK `AI_APICallError` for the
  // xAI 403 `permission-denied` refusal.
  function createRefusal() {
    return {
      isRetryable: false,
      message: "permission-denied: I can't help with that request.",
      name: 'AI_APICallError',
      responseBody:
        '{"code":"permission-denied","error":"I can\'t help with that request."}',
      statusCode: 403,
    };
  }

  it('recognises the recorded xAI content refusal', () => {
    expect(isProviderContentRefusal(createRefusal())).toBe(true);
  });

  it('matches the error message when no responseBody is present', () => {
    const error = Object.assign(
      new Error("permission-denied: I can't help with that request."),
      { statusCode: 403 },
    );
    expect(isProviderContentRefusal(error)).toBe(true);
  });

  it('rejects a 403 without the refusal markers', () => {
    expect(
      isProviderContentRefusal({
        message: 'forbidden: Invalid API key',
        responseBody: '{"code":"forbidden","error":"Invalid API key"}',
        statusCode: 403,
      }),
    ).toBe(false);
  });

  it.each([500, 429])(
    'rejects status %s even with a similar message',
    (statusCode) => {
      expect(
        isProviderContentRefusal({
          message: "permission-denied: I can't help with that request.",
          statusCode,
        }),
      ).toBe(false);
    },
  );

  it('rejects a plain error with the message but no status code', () => {
    expect(isProviderContentRefusal(new Error('permission-denied'))).toBe(
      false,
    );
  });

  it.each([null, undefined, 'permission-denied'])(
    'rejects non-error input %s',
    (input) => {
      expect(isProviderContentRefusal(input)).toBe(false);
    },
  );

  it('is disjoint from isTransientProviderFailure for the refusal', () => {
    const refusal = createRefusal();
    expect(isProviderContentRefusal(refusal)).toBe(true);
    expect(isTransientProviderFailure(refusal)).toBe(false);
  });
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
