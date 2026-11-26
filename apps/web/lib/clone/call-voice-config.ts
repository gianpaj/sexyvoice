import {
  CHATTERBOX_SUPPORTED_LOCALE_CODES,
  VOXTRAL_SUPPORTED_LOCALE_CODES,
} from './constants';

/**
 * Regional accents offered for Inworld voices. Inworld speaks a bare code in
 * the first accent listed, so the bare code stands for that accent and the
 * others are options of their own.
 * https://docs.inworld.ai/tts/capabilities/multilingual
 */
const INWORLD_ACCENTS: Record<string, readonly [string, ...string[]]> = {
  en: ['en-US', 'en-GB', 'en-AU'],
  es: ['es-ES', 'es-MX', 'es-419'],
  fr: ['fr-FR', 'fr-CA'],
  pt: ['pt-BR', 'pt-PT'],
  zh: ['zh-CN', 'zh-TW'],
};

/** Accent options beyond the Clone page languages, such as `pt-PT`. */
export const INWORLD_EXTRA_ACCENT_CODES = Object.values(
  INWORLD_ACCENTS,
).flatMap(([, ...others]) => others);

/** The accent Inworld speaks for `code`, used to name it. */
export function inworldAccent(code: string) {
  return INWORLD_ACCENTS[code]?.[0] ?? code;
}

/** The Clone page language of an Inworld accent option. */
export function toCloneLocale(code: string) {
  return INWORLD_EXTRA_ACCENT_CODES.includes(code) ? code.split('-')[0] : code;
}

/**
 * Languages a saved Inworld voice can be cloned in and speak: every Clone page
 * language and the extra accents. `en-multi` only selects Chatterbox for
 * one-off English clips.
 */
const INWORLD_CALL_CLONE_LOCALE_CODES = new Set([
  ...CHATTERBOX_SUPPORTED_LOCALE_CODES,
  ...VOXTRAL_SUPPORTED_LOCALE_CODES,
  ...INWORLD_EXTRA_ACCENT_CODES,
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
