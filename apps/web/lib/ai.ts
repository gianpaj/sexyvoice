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
