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

const DEFAULT_LIMIT = 500;

export const getCharactersLimit = (_model: string, _isPaidUser = false) => {
  return DEFAULT_LIMIT;
};
