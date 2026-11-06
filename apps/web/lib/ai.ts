import type { GenerateContentResponse } from '@google/genai';

import { isActiveTtsModel } from '@/lib/tts/models';
import { getTtsProvider } from '@/lib/utils';

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

// Gemini 3.8 inline vocal tags. English tags apply to every transcript language.
// https://ai.google.dev/gemini-api/docs/speech-generation
export const GEMINI_38_AUDIO_TAGS =
  '<argh>, <breath>, <heavy breath>, <exhales>, <cackle>, <cheer>, <chuckle>, <chuckles>, <cough>, <cry>, <gasp>, <giggle>, <groan>, <growl>, <grunt>, <grr>, <hiss>, <laugh>, <laughter>, <moan>, <pant>, <pff>, <phew>, <scream>, <shout>, <shriek>, <sigh>, <sighs>, <sneeze>, <snicker>, <snort>, <sob>, <throat-clearing>, <tsk>, <whimper>, <whispers>, <whispering>, <yawn>, <short pause>, <long pause>';

/**
 * Inline emotion tags a voice understands, or undefined when the model has no
 * inline tag set (Grok). Orpheus tags vary by language.
 */
export const getEmotionTags = ({
  language,
  model,
}: {
  language: string;
  model: string;
}) => {
  if (!isActiveTtsModel(model)) return;
  if (model === 'gpro38') return GEMINI_38_AUDIO_TAGS;
  if (getTtsProvider(model) !== 'replicate') return;
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
  if (model === 'gpro38' || model === 'xai') {
    return PAID_LIMIT;
  }
  return DEFAULT_LIMIT;
};

// Bound delivery direction separately from the transcript.
const GEMINI_STYLE_LIMIT_FREE = 1000;
const GEMINI_STYLE_LIMIT_PAID = 2500;

/** Character limit for the Gemini style prompt, per tier. */
export const getGeminiStyleCharacterLimit = (isPaidUser = false) =>
  isPaidUser ? GEMINI_STYLE_LIMIT_PAID : GEMINI_STYLE_LIMIT_FREE;
