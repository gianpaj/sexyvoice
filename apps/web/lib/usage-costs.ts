import { calculateGenerateApiDollarAmount } from './api/pricing';

export interface CostUsage {
  dollar_amount: number | null;
  duration_seconds: number | null;
  input_chars: number | null;
  metadata: unknown;
  model: string | null;
  source_type: string;
}
export interface CallCostInput {
  duration_seconds: number | null;
  ended_at?: string | null;
  model: string | null;
  started_at?: string;
}
export interface UsageCost {
  amount: number;
  basis: 'recorded' | 'estimated' | 'unknown';
}
export function costMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function dimension(value: unknown): number | null {
  if ((typeof value !== 'number' && typeof value !== 'string') || value === '')
    return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// Model-specific rates, verified against https://docs.x.ai/developers/pricing.
// Unknown models stay unpriced; customer credit buckets are not provider time.
const CALL_RATES: Record<string, number> = {
  'grok-voice-think-fast-1.0': 0.05,
  'grok-voice-think-fast-2.0': 0.08,
};
const GEMINI_MODELS = new Set([
  'gemini-2.5-flash-preview-tts',
  'gemini-2.5-pro-preview-tts',
  'gemini-3.1-flash-tts-preview',
]);

export function resolveUsageCost(
  event: CostUsage,
  call?: CallCostInput,
  audioUsage?: unknown,
): UsageCost {
  if (
    event.dollar_amount !== null &&
    Number.isFinite(event.dollar_amount) &&
    event.dollar_amount > 0
  ) {
    return { amount: event.dollar_amount, basis: 'recorded' };
  }
  if (event.source_type === 'live_call') {
    const rate = CALL_RATES[call?.model ?? event.model ?? ''];
    let seconds = dimension(call?.duration_seconds ?? event.duration_seconds);
    // The call service truncates duration to whole seconds. Recover only the
    // sub-second interval that explains a stored zero, not larger discrepancies.
    if (call?.duration_seconds === 0 && call.started_at && call.ended_at) {
      const elapsed =
        (Date.parse(call.ended_at) - Date.parse(call.started_at)) / 1000;
      if (elapsed > 0 && elapsed < 1) seconds = elapsed;
    }
    if (rate !== undefined && seconds !== null && seconds > 0) {
      return { amount: (seconds / 60) * rate, basis: 'estimated' };
    }
    return { amount: 0, basis: 'unknown' };
  }
  const metadata = costMetadata(event.metadata);
  const model =
    event.model ?? (typeof metadata.model === 'string' ? metadata.model : null);
  const tokens = { ...costMetadata(audioUsage), ...metadata };
  const input = dimension(tokens.promptTokenCount);
  const output = dimension(tokens.candidatesTokenCount);
  if (
    ['tts', 'api_tts'].includes(event.source_type) &&
    model &&
    GEMINI_MODELS.has(model) &&
    input !== null &&
    output !== null &&
    output > 0
  ) {
    return {
      amount: calculateGenerateApiDollarAmount({
        candidatesTokenCount: output,
        model,
        promptTokenCount: input,
        provider: 'google',
        sourceType: 'tts',
      }),
      basis: 'estimated',
    };
  }
  // Missing provider dimensions and sentinel costs must not look like free usage.
  return { amount: 0, basis: 'unknown' };
}
