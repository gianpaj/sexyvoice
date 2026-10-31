export type CloneProvider = 'mistral' | 'replicate';

/**
 * Shortest reference audio accepted per clone provider, in seconds. The
 * server rejects shorter clips and the recorder warns before upload.
 * Inworld's documented minimum is 3 seconds:
 * https://docs.inworld.ai/tts/instant-voice-cloning
 */
export const CLONE_MIN_AUDIO_SECONDS: Record<
  CloneProvider | 'inworld',
  number
> = {
  inworld: 3,
  mistral: 3,
  replicate: 10,
};

export const VOICE_CLONING_MODELS: readonly string[] = [
  'resemble-ai/chatterbox-multilingual',
  'resemble-ai/chatterbox',
  'voxtral-mini-tts-2603',
  'voxtral-mini-tts-3-0',
  // Saved Inworld voices; no other path stores this model.
  'inworld-tts-2',
];

// Confirmed TTS languages; Mistral does not enumerate its full 35-language set.
// https://docs.mistral.ai/studio/audio/specs-and-limits/languages
// Greek is also confirmed at https://mistral.ai/news/voxtral-3/
export const VOXTRAL_SUPPORTED_LOCALE_CODES = new Set([
  'ar',
  'ca',
  'de',
  'el',
  'en',
  'es',
  'fr',
  'hi',
  'hu',
  'it',
  'ja',
  'ko',
  'nl',
  'no',
  'pl',
  'pt',
  'ro',
  'ru',
  'tr',
  'uk',
  'vi',
  'zh',
]);

// https://replicate.com/resemble-ai/chatterbox-multilingual/api/schema
export const CHATTERBOX_SUPPORTED_LOCALE_CODES = new Set([
  'ar',
  'da',
  'de',
  'el',
  'en',
  'es',
  'fi',
  'fr',
  'he',
  'hi',
  'it',
  'ja',
  'ko',
  'ms',
  'nl',
  'no',
  'pl',
  'pt',
  'ru',
  'sv',
  'sw',
  'tr',
  'zh',
]);

export const CLONE_SUPPORTED_LOCALE_CODES = new Set([
  ...CHATTERBOX_SUPPORTED_LOCALE_CODES,
  ...VOXTRAL_SUPPORTED_LOCALE_CODES,
  // Select Chatterbox explicitly for English instead of Voxtral.
  'en-multi',
]);

export const resolveBaseCloneLocale = (code: string) =>
  code === 'en-multi' ? 'en' : code;

// Review this set when CLONE_SUPPORTED_LOCALE_CODES changes, especially for fa/ur.
export const RTL_CLONE_LOCALE_CODES = new Set(['ar', 'he']);

export const CLONE_TEXT_MAX_LENGTH_NON_VOXTRAL = 300;
export const CLONE_TEXT_MAX_LENGTH_VOXTRAL_FREE = 1000;
export const CLONE_TEXT_MAX_LENGTH_VOXTRAL_PAID = 4000;
/** Inworld's non-streaming limit, in UTF-16 code units. */
export const INWORLD_TEXT_MAX_LENGTH = 2000;
