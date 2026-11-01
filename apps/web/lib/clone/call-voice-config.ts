import {
  CHATTERBOX_SUPPORTED_LOCALE_CODES,
  VOXTRAL_SUPPORTED_LOCALE_CODES,
} from './constants';

/**
 * Languages a saved Inworld voice can be cloned in: every Clone page
 * language. `en-multi` only selects Chatterbox for one-off English clips.
 */
const INWORLD_CALL_CLONE_LOCALE_CODES = new Set([
  ...CHATTERBOX_SUPPORTED_LOCALE_CODES,
  ...VOXTRAL_SUPPORTED_LOCALE_CODES,
]);

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
    ? INWORLD_CALL_CLONE_LOCALE_CODES.has(locale)
    : VOXTRAL_SUPPORTED_LOCALE_CODES.has(locale);
}
