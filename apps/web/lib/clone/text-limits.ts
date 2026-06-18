import {
  CLONE_TEXT_MAX_LENGTH_NON_VOXTRAL,
  CLONE_TEXT_MAX_LENGTH_VOXTRAL_FREE,
  CLONE_TEXT_MAX_LENGTH_VOXTRAL_PAID,
  VOXTRAL_SUPPORTED_LOCALE_CODES,
} from './constants';

export function getCloneTextMaxLength(
  locale: string,
  userHasPaid: boolean,
): number {
  if (!VOXTRAL_SUPPORTED_LOCALE_CODES.has(locale)) {
    return CLONE_TEXT_MAX_LENGTH_NON_VOXTRAL;
  }

  return userHasPaid
    ? CLONE_TEXT_MAX_LENGTH_VOXTRAL_PAID
    : CLONE_TEXT_MAX_LENGTH_VOXTRAL_FREE;
}

export function isCloneTextOverLimit({
  locale,
  text,
  userHasPaid,
}: {
  locale: string;
  text: string;
  userHasPaid: boolean;
}): boolean {
  return text.length > getCloneTextMaxLength(locale, userHasPaid);
}
