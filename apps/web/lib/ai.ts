import type { GenerateContentResponse } from '@google/genai';

/**
 * Gemini may return a text/safety part before the audio part, so scan all
 * candidates and parts for the first one carrying inline audio data instead
 * of hard-indexing candidates[0].content.parts[0].
 */
export function extractInlineAudio(response: GenerateContentResponse | null): {
  data: string | undefined;
  mimeType: string | undefined;
} {
  for (const candidate of response?.candidates ?? []) {
    for (const part of candidate.content?.parts ?? []) {
      if (part.inlineData?.data) {
        return {
          data: part.inlineData.data,
          mimeType: part.inlineData.mimeType,
        };
      }
    }
  }
  return { data: undefined, mimeType: undefined };
}

// Gemini 3.1 audio tags for inline expressive control
export const GEMINI_AUDIO_TAGS =
  '[cheerfully], [whispering], [laughing], [pause], [excited], [sadly], [nervously], [slowly], [fast], [breathily], [sighing], [giggling]';

// Emotion tags for each voice based on language
export const getEmotionTags = (language: string) => {
  if (language.startsWith('it-')) {
    return '<sigh>, <laugh>, <cough>, <sniffle>, <groan>, <yawn>, <gemito>, <gasp>';
  }
  if (language.startsWith('es-')) {
    return '<groan>, <chuckle>, <gasp>, <resoplido>, <laugh>, <yawn>, <cough>';
  }
  if (language.startsWith('en-')) {
    return '<laugh>, <chuckle>, <sigh>, <cough>, <sniffle>, <groan>, <yawn>, <gasp>';
  }
};

const PAID_LIMIT = 1000;
const DEFAULT_LIMIT = 500;

export const getCharactersLimit = (model: string, isPaidUser = false) => {
  if (!isPaidUser) {
    return DEFAULT_LIMIT;
  }
  if (model === 'gpro' || model === 'gpro31' || model === 'xai') {
    return PAID_LIMIT;
  }
  return DEFAULT_LIMIT;
};

// Gemini voices accept a separate style / "director's notes" prompt in addition
// to the transcript. It must be capped per tier so it can't be used to bypass
// the transcript character limit (getCharactersLimit) and inflate provider cost.
//
// Gemini 2.5 voices: the style is a short character-bounded prompt.
const GEMINI_25_STYLE_LIMIT_FREE = 1000;
const GEMINI_25_STYLE_LIMIT_PAID = 2500;

// Gemini 3.1 (gpro31) streams audio, so the transcript and style share one
// larger combined *token* budget instead of separate character caps.
const GEMINI_31_TOKEN_LIMIT_FREE = 8000;
const GEMINI_31_TOKEN_LIMIT_PAID = 32_000;

// No tokenizer is bundled, so approximate tokens from characters. ~4 chars per
// token is the conventional rough heuristic for English-like text.
export const GEMINI_CHARS_PER_TOKEN = 4;

/** Character limit for the Gemini 2.5 style prompt, per tier. */
export const getGeminiStyleCharacterLimit = (isPaidUser = false) =>
  isPaidUser ? GEMINI_25_STYLE_LIMIT_PAID : GEMINI_25_STYLE_LIMIT_FREE;

/** Combined (style + transcript) token budget for Gemini 3.1 (gpro31), per tier. */
export const getGeminiCombinedTokenLimit = (isPaidUser = false) =>
  isPaidUser ? GEMINI_31_TOKEN_LIMIT_PAID : GEMINI_31_TOKEN_LIMIT_FREE;

/** Rough token-count estimate from character length (no tokenizer available). */
export const estimateTokenCount = (text: string) =>
  Math.ceil(text.length / GEMINI_CHARS_PER_TOKEN);
