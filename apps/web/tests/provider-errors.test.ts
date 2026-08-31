import { describe, expect, it, vi } from 'vitest';

import { getProviderUnavailableMessage } from '@/lib/api/provider-unavailable-message';
import { resolveErrorMessage } from '@/lib/api/resolve-error-message';
import type { ProviderUnavailableDetails } from '@/lib/provider-errors';
import {
  formatProviderDisplayName,
  getProviderUnavailableDetails,
  isProviderDisplayName,
  isProviderId,
} from '@/lib/provider-errors';

vi.mock('server-only', () => ({}));

const providers = [
  ['gemini', 'Gemini'],
  ['grok', 'Grok'],
  ['mistral', 'Mistral'],
  ['replicate', 'Replicate'],
] as const;

function createTranslator(hasKey = true) {
  return Object.assign(
    (_key: 'PROVIDER_UNAVAILABLE', details: ProviderUnavailableDetails) =>
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

describe('getProviderUnavailableMessage', () => {
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
