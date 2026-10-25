import {
  CLONE_SUPPORTED_LOCALE_CODES,
  VOXTRAL_SUPPORTED_LOCALE_CODES,
} from './constants';

export type CallCloneProvider = 'inworld' | 'mistral';

export function supportsCallCloneLocale(
  provider: CallCloneProvider,
  locale: string,
) {
  return provider === 'inworld'
    ? CLONE_SUPPORTED_LOCALE_CODES.has(locale)
    : VOXTRAL_SUPPORTED_LOCALE_CODES.has(locale);
}
