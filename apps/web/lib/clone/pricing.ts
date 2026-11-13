import { estimateSpeechCredits } from '@/lib/tts/models';
import { CLONE_PROVIDERS, type CloneProvider } from './providers';
import { getVoxtralDollarCost } from './voxtral';

/** Credits reserved for a cloned-voice generation. */
export function estimateCloneCredits(text: string): number {
  return estimateSpeechCredits(text, 11);
}

// Inworld TTS-2 on the Builder plan.
const INWORLD_DOLLARS_PER_CHARACTER = 17.5 / 1_000_000;

// resemble-ai/chatterbox-multilingual costs about $0.0046 a run on Replicate;
// 0.0121 is the average of its last 11 predictions.
const CHATTERBOX_DOLLARS_PER_RUN = 0.0121;

/** Provider cost of one cloned-voice generation; -1 when unknown. */
export function cloneProviderCost(provider: CloneProvider, text: string) {
  if (provider === 'replicate') {
    return CHATTERBOX_DOLLARS_PER_RUN;
  }
  if (!text) {
    return -1;
  }
  return provider === 'mistral'
    ? getVoxtralDollarCost(CLONE_PROVIDERS.mistral.model, text)
    : text.length * INWORLD_DOLLARS_PER_CHARACTER;
}
