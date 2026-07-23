import {
  CLONE_TEXT_MAX_LENGTH_INWORLD,
  CLONE_TEXT_MAX_LENGTH_NON_VOXTRAL,
  CLONE_TEXT_MAX_LENGTH_VOXTRAL_FREE,
  CLONE_TEXT_MAX_LENGTH_VOXTRAL_PAID,
  type CloneProvider,
  VOXTRAL_SUPPORTED_LOCALE_CODES,
} from './constants';

export function getCloneTextMaxLength(
  locale: string,
  userHasPaid: boolean,
  provider?: CloneProvider | null,
): number {
  if (provider === 'inworld') {
    return CLONE_TEXT_MAX_LENGTH_INWORLD;
  }

  if (!VOXTRAL_SUPPORTED_LOCALE_CODES.has(locale)) {
    return CLONE_TEXT_MAX_LENGTH_NON_VOXTRAL;
  }

  return userHasPaid
    ? CLONE_TEXT_MAX_LENGTH_VOXTRAL_PAID
    : CLONE_TEXT_MAX_LENGTH_VOXTRAL_FREE;
}

export function isCloneTextOverLimit({
  locale,
  provider,
  text,
  userHasPaid,
}: {
  locale: string;
  provider?: CloneProvider | null;
  text: string;
  userHasPaid: boolean;
}): boolean {
  return text.length > getCloneTextMaxLength(locale, userHasPaid, provider);
}
