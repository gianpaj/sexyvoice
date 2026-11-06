import { estimateSpeechCredits } from '@/lib/tts/models';
import type { CloneProvider } from './constants';
import { getVoxtralDollarCost, type VoxtralModel } from './voxtral';

/** Credits reserved for a cloned-voice generation. */
export function estimateCloneCredits(text: string): number {
  return estimateSpeechCredits(text, 11);
}

// Inworld TTS-2 on the Builder plan.
const INWORLD_DOLLARS_PER_CHARACTER = 17.5 / 1_000_000;

/** Provider cost of one cloned-voice generation; -1 when unknown. */
export const getCloneDollarCost = (
  provider: CloneProvider | 'inworld',
  credits?: number,
  text?: string,
  model: VoxtralModel = 'voxtral-mini-tts-2603',
) => {
  if (provider === 'mistral') {
    return text ? getVoxtralDollarCost(model, text) : -1;
  }
  if (provider === 'inworld') {
    return text ? text.length * INWORLD_DOLLARS_PER_CHARACTER : -1;
  }
  if (provider === 'replicate') {
    // resemble-ai/chatterbox-multilingual costs about $0.0046 a run on
    // Replicate; 0.0121 is the average of its last 11 predictions.
    return credits ? 0.0121 : -1;
  }
  return -1;
};
