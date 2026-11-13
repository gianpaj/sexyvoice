import { callModelCostPerMinute } from './calls/models';
import { speechProviderCost } from './tts/provider-cost';

export type UsageEventCostInput = Pick<
  Tables<'usage_events'>,
  | 'dollar_amount'
  | 'duration_seconds'
  | 'input_chars'
  | 'metadata'
  | 'model'
  | 'source_type'
> &
  Partial<Pick<Tables<'usage_events'>, 'occurred_at'>>;
export type CallSessionCostInput = Pick<
  Tables<'call_sessions'>,
  'duration_seconds' | 'model'
> &
  Partial<Pick<Tables<'call_sessions'>, 'started_at' | 'ended_at'>>;
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

// Unknown models stay unpriced; customer credit buckets are not provider time.
// xAI billed think-fast-1.0 at $0.05/min until it moved 1.0 traffic to the
// 2.0 rate; its billing API shows the switch at this instant.
const THINK_FAST_1_LEGACY_UNTIL = Date.parse('2026-09-13T06:00:00Z');

function callRate(model: string, at: string | undefined): number | undefined {
  if (
    model === 'grok-voice-think-fast-1.0' &&
    at &&
    Date.parse(at) < THINK_FAST_1_LEGACY_UNTIL
  ) {
    return 0.05;
  }
  return callModelCostPerMinute(model);
}
export const GEMINI_MODELS = new Set([
  'gemini-2.5-flash-preview-tts',
  'gemini-2.5-pro-preview-tts',
  'gemini-3.1-flash-tts-preview',
  'gemini-3.8-flash-tts',
]);

const PARTIAL_CALL_COMPONENTS = new Map<string, string[]>([
  ['inworld_pipeline_usage', ['llm', 'stt', 'tts']],
  ['inworld_realtime_usage', ['llm_input', 'llm_output', 'tts']],
  ['mistral_pipeline_usage', ['llm', 'stt', 'tts']],
]);

function partialCallCost(metadata: unknown): UsageCost {
  const providerCost = costMetadata(costMetadata(metadata).provider_cost);
  const components =
    typeof providerCost.strategy === 'string'
      ? PARTIAL_CALL_COMPONENTS.get(providerCost.strategy)
      : undefined;
  const breakdown = costMetadata(providerCost.breakdown_usd);
  const amount =
    providerCost.status === 'unpriced' && components
      ? components.reduce(
          (sum, key) => sum + (dimension(breakdown[key]) ?? 0),
          0,
        )
      : 0;
  // Known components are a floor on spend; the complete call is still unpriced.
  return { amount: Number.isFinite(amount) ? amount : 0, basis: 'unknown' };
}

export function resolveUsageCost(
  event: UsageEventCostInput,
  call?: CallSessionCostInput,
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
    const rate = callRate(
      call?.model ?? event.model ?? '',
      call?.started_at ?? event.occurred_at,
    );
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
    return partialCallCost(event.metadata);
  }
  const metadata = costMetadata(event.metadata);
  const model =
    event.model ?? (typeof metadata.model === 'string' ? metadata.model : null);
  const tokens = costMetadata(audioUsage);
  const input =
    dimension(tokens.promptTokenCount) ?? dimension(metadata.promptTokenCount);
  const output =
    dimension(tokens.candidatesTokenCount) ??
    dimension(metadata.candidatesTokenCount);
  if (
    ['tts', 'api_tts'].includes(event.source_type) &&
    model &&
    GEMINI_MODELS.has(model) &&
    input !== null &&
    output !== null &&
    output > 0
  ) {
    const amount = speechProviderCost({
      candidatesTokenCount: output,
      model,
      occurredAt: event.occurred_at,
      promptTokenCount: input,
    });
    if (Number.isFinite(amount) && amount > 0) {
      return { amount, basis: 'estimated' };
    }
  }
  // Missing provider dimensions and sentinel costs must not look like free usage.
  return { amount: 0, basis: 'unknown' };
}
