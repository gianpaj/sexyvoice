import { encoding_for_model } from '@dbdq/tiktoken';

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

const GEMINI_LIMIT = 1000;
const DEFAULT_LIMIT = 500;

export const getCharactersLimit = (model: string) => {
  if (model === 'gpro') {
    return GEMINI_LIMIT;
  }
  return DEFAULT_LIMIT;
};

export function estimateCredits(
  text: string,
  voice: string,
  model?: string,
): number {
  if (!text.trim()) {
    return 0;
  }

  if (!voice) {
    throw new Error('Voice is required');
  }

  // Get token count using tiktoken
  const encoder = encoding_for_model('gpt-4');
  const tokens = encoder.encode(text).length;
  encoder.free(); // Free memory

  // Define multipliers based on voice
  let multiplier: number;
  switch (voice) {
    case 'pietro':
    case 'giulia':
    case 'carlo':
    case 'javi':
    case 'sergio':
    case 'maria':
      multiplier = 8;
      break;
    case 'clone':
      multiplier = 11;
      break;
    default:
      multiplier = 4;
      break;
  }

  if (model === 'gpro') {
    multiplier = 4;
  }

  // Return tokens multiplied by the hardcoded multiplier
  return Math.ceil(tokens * multiplier);
}
