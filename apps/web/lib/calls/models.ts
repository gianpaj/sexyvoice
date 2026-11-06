import type { CallCloneProvider } from '@/lib/clone/call-voice-config';

interface CallModel {
  /**
   * Provider cost in USD per minute, verified against
   * https://docs.x.ai/developers/pricing. Unpriced models stay unknown.
   */
  costPerMinute?: number;
  /**
   * `realtime` speaks through Grok's voice agent. `tts` runs STT, an LLM and
   * the saved voice provider's TTS.
   */
  pipeline: 'realtime' | 'tts';
  /** Saved voices from this provider speak through this model. */
  provider?: CallCloneProvider;
}

const MODELS = {
  'grok-voice-think-fast-1.0': { costPerMinute: 0.08, pipeline: 'realtime' },
  'grok-voice-think-fast-2.0': { costPerMinute: 0.08, pipeline: 'realtime' },
  'inworld-tts': { pipeline: 'tts', provider: 'inworld' },
  'mistral-tts': { pipeline: 'tts', provider: 'mistral' },
} satisfies Record<string, CallModel>;

/** A model the call agent runs, as the id it receives in token metadata. */
export type CallModelId = keyof typeof MODELS;

export const CALL_MODELS: Readonly<Record<CallModelId, CallModel>> = MODELS;

export const CALL_MODEL_IDS = Object.keys(MODELS) as [
  CallModelId,
  ...CallModelId[],
];

/** Built-in voices speak through this model. */
export const DEFAULT_CALL_MODEL: CallModelId = 'grok-voice-think-fast-2.0';

const isCallModel = (model: string): model is CallModelId =>
  Object.hasOwn(MODELS, model);

/**
 * Resolves a stored or client-supplied model id to a supported one. Saved
 * characters keep the id they were saved with, and unknown ids fall back to
 * the default.
 */
export function normalizeCallModel(
  model: string | null | undefined,
): CallModelId {
  return model && isCallModel(model) ? model : DEFAULT_CALL_MODEL;
}

/** The saved-voice provider a model speaks with; null for built-in voices. */
export function callVoiceProvider(model: string): CallCloneProvider | null {
  return isCallModel(model) ? (CALL_MODELS[model].provider ?? null) : null;
}

/** The model a voice speaks through: its saved-voice provider's, else the default. */
export function callModelFor(provider?: CallCloneProvider): CallModelId {
  if (!provider) return DEFAULT_CALL_MODEL;
  return (
    CALL_MODEL_IDS.find((id) => CALL_MODELS[id].provider === provider) ??
    DEFAULT_CALL_MODEL
  );
}

/** Provider cost per minute of a call on `model`, when known. */
export function callModelCostPerMinute(model: string): number | undefined {
  return isCallModel(model) ? CALL_MODELS[model].costPerMinute : undefined;
}
