import { GoogleGenAI } from '@google/genai';

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

export const countGeminiTokens = async ({
  model,
  contents,
}: {
  model: string;
  contents: string;
}): Promise<number> => {
  try {
    const ai = new GoogleGenAI({
      apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    });
    const tokensReponse = await ai.models.countTokens({ model, contents });

    return tokensReponse.totalTokens ?? -1;
  } catch (_error) {
    return -1;
  }
};
