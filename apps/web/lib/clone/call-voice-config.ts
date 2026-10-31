import {
  CLONE_SUPPORTED_LOCALE_CODES,
  VOXTRAL_SUPPORTED_LOCALE_CODES,
} from './constants';

export const CALL_CLONE_PROVIDERS = ['inworld', 'mistral'] as const;

export type CallCloneProvider = (typeof CALL_CLONE_PROVIDERS)[number];

/**
 * Saved voices per user. Inworld voices also count against the workspace's
 * plan limit, which every user shares.
 */
export const MAX_SAVED_CALL_VOICES = 10;

export function isCallCloneProvider(value: string): value is CallCloneProvider {
  return (CALL_CLONE_PROVIDERS as readonly string[]).includes(value);
}

export function supportsCallCloneLocale(
  provider: CallCloneProvider,
  locale: string,
) {
  return provider === 'inworld'
    ? CLONE_SUPPORTED_LOCALE_CODES.has(locale)
    : VOXTRAL_SUPPORTED_LOCALE_CODES.has(locale);
}
