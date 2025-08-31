// @ts-expect-error
import wasm from 'tiktoken/lite/tiktoken_bg.wasm?module';
import model from 'tiktoken/encoders/cl100k_base.json';
import { init, Tiktoken } from 'tiktoken/lite/init';

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

export async function estimateCredits(
  text: string,
  voice: string,
  model?: string,
): Promise<number> {
  if (!text.trim()) {
    return 0;
  }

  if (!voice) {
    throw new Error('Voice is required');
  }

  // Initialize tiktoken for Edge Runtime
  await init((imports) => WebAssembly.instantiate(wasm, imports));

  const encoding = new Tiktoken(
    model.bpe_ranks,
    model.special_tokens,
    model.pat_str,
  );

  try {
    // Count tokens instead of words
    const tokens = encoding.encode(text.trim());
    const tokenCount = tokens.length;

    let multiplier: number;
    // Calculate multiplier based on voice
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
    return Math.ceil(tokenCount * multiplier);
  } finally {
    // Clean up encoder
    encoding.free();
  }
}
