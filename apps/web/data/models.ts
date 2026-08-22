export const ModelId = {
  // Grok Voice Agent model
  GROK_VOICE_THINK_FAST_1_0: 'grok-voice-think-fast-1.0',
  GROK_VOICE_THINK_FAST_2_0: 'grok-voice-think-fast-2.0',
  // Inworld realtime voice model (uses a cloned audio_references voice)
  INWORLD_REALTIME: 'inworld-realtime',
} as const;

export type ModelIdValue = (typeof ModelId)[keyof typeof ModelId];

export const DEFAULT_MODEL_ID: ModelIdValue = ModelId.GROK_VOICE_THINK_FAST_1_0;

/**
 * Model ids that are no longer offered, mapped to their replacement. Rows in
 * `characters.session_config` created before an upgrade keep the old id, so
 * every read path normalizes instead of trusting the stored value.
 */
const REPLACED_MODEL_IDS: Record<string, ModelIdValue> = {
  'grok-voice-think-fast-1.0': ModelId.GROK_VOICE_THINK_FAST_1_0,
  'grok-voice-think-fast-2.0': ModelId.GROK_VOICE_THINK_FAST_1_0,
};

const SUPPORTED_MODEL_IDS = new Set<string>(Object.values(ModelId));

/**
 * Resolves a persisted or client-supplied model id to a currently supported
 * one, falling back to the default for unknown values.
 */
export function normalizeModelId(
  model: string | null | undefined,
): ModelIdValue {
  if (!model) return DEFAULT_MODEL_ID;
  if (SUPPORTED_MODEL_IDS.has(model)) return model as ModelIdValue;
  return REPLACED_MODEL_IDS[model] ?? DEFAULT_MODEL_ID;
}
