// https://mistral.ai/news/voxtral-3/
export const VOXTRAL_DOLLARS_PER_MILLION_CHARACTERS = {
  'voxtral-mini-tts-2603': 16,
  'voxtral-mini-tts-3-0': 13,
} as const;

export type VoxtralModel = keyof typeof VOXTRAL_DOLLARS_PER_MILLION_CHARACTERS;

export function getVoxtralDollarCost(
  model: VoxtralModel,
  text: string,
): number {
  return (
    (text.length * VOXTRAL_DOLLARS_PER_MILLION_CHARACTERS[model]) / 1_000_000
  );
}
