// https://docs.mistral.ai/studio/audio/text-to-speech/emotion-tags.md
export const VOXTRAL_EMOTIONS = [
  'amused',
  'angry',
  'anxious',
  'apologetic',
  'appreciative',
  'assertive',
  'bored',
  'calm',
  'confident',
  'confused',
  'critical',
  'curious',
  'determined',
  'disappointed',
  'disgusted',
  'excited',
  'frustrated',
  'grateful',
  'happy',
  'hopeful',
  'playful',
  'proud',
  'reflective',
  'resigned',
  'sad',
  'sarcastic',
  'skeptical',
  'somber',
  'surprised',
  'tense',
  'tired',
  'urgent',
  'warm',
  'wistful',
] as const;

export const VOXTRAL_PACES = [
  'very-slow',
  'slow',
  'moderate',
  'fast',
  'very-fast',
] as const;

export const VOXTRAL_DISFLUENCIES = [
  'um',
  'uh',
  'laugh',
  'breath',
  'sigh',
  'gasp',
  'sniff',
  'cough',
  'throat clearing',
  'yawn',
  'chuckle',
  'laugh hard',
  'gasping',
  'rire',
] as const;

export const VOXTRAL_TAG_GROUPS = [
  {
    labelKey: 'emotions',
    tags: VOXTRAL_EMOTIONS.map((emotion) => `[emotion=${emotion}]` as const),
  },
  {
    labelKey: 'pace',
    tags: VOXTRAL_PACES.map((pace) => `[pace=${pace}]` as const),
  },
  {
    labelKey: 'vocalSounds',
    tags: VOXTRAL_DISFLUENCIES.map((sound) => `[${sound}]` as const),
  },
] as const;

export const VOXTRAL_TAGS = VOXTRAL_TAG_GROUPS.flatMap(({ tags }) => tags);
export type VoxtralTag = (typeof VOXTRAL_TAGS)[number];
