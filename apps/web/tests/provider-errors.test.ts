import { describe, expect, it } from 'vitest';

import {
  getProviderUnavailableMessage,
  PROVIDER_UNAVAILABLE_TEMPLATE,
} from '@/lib/errors/provider-unavailable-message';
import {
  type ErrorCodesTranslator,
  resolveErrorMessage,
} from '@/lib/errors/resolve-error-message';
import {
  formatProviderDisplayName,
  getProviderUnavailableDetails,
  isProviderDisplayName,
  isProviderId,
} from '@/lib/provider-errors';
import messages from '@/messages/en.json';

const providers = [
  ['gemini', 'Gemini'],
  ['grok', 'Grok'],
  ['mistral', 'Mistral'],
  ['replicate', 'Replicate'],
] as const;

function createTranslator(hasKey = true): ErrorCodesTranslator {
  return Object.assign(
    (key: string, values?: Record<string, string>) =>
      key === 'PROVIDER_UNAVAILABLE'
        ? `${values?.provider} is unavailable in this locale.`
        : 'Shorten the text in this locale.',
    { has: () => hasKey },
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

  it('returns a translated output-limit error', () => {
    expect(
      resolveErrorMessage(
        createTranslator(),
        'GEMINI_OUTPUT_LIMIT',
        undefined,
        serverFallback,
      ),
    ).toBe('Shorten the text in this locale.');
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
