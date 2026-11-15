/**
 * What a speech provider charges the platform for one generation. Rates are
 * keyed by the provider model that ran (the stored `usage_events.model`), so
 * the dashboard and the external API price the same call the same way.
 * Retired Gemini models keep their rates for historical reports.
 */

interface ProviderPrice {
  perInputChar?: number;
  perInputToken?: number;
  perOutputToken?: number;
}

const ORPHEUS_PRICE: ProviderPrice = { perInputChar: 0.000_015 };

const PRICES: Record<string, ProviderPrice> = {
  'gemini-2.5-flash-preview-tts': {
    perInputToken: 0.000_000_5,
    perOutputToken: 0.000_01,
  },
  'gemini-2.5-pro-preview-tts': {
    perInputToken: 0.000_001,
    perOutputToken: 0.000_02,
  },
  'gemini-3.1-flash-tts-preview': {
    perInputToken: 0.000_001,
    perOutputToken: 0.000_02,
  },
  'gianpaj/cog-orpheus-3b-0.1-ft:666dc0c400952f2c18f0a46233dca2053ebef622754769878cd5497e20714650':
    ORPHEUS_PRICE,
  'lucataco/orpheus-3b-0.1-ft:79f2a473e6a9720716a473d9b2f2951437dbf91dc02ccb7079fb3d89b881207f':
    ORPHEUS_PRICE,
  // $4.20 per million characters.
  xai: { perInputChar: 0.000_004_2 },
};

// Standard tier: https://ai.google.dev/gemini-api/docs/pricing#gemini-3.8-flash-tts
const GEMINI_38_PROMOTION_ENDS = Date.parse('2027-01-01T00:00:00Z');

function priceFor(
  model: string,
  occurredAt: string | Date | undefined,
): ProviderPrice {
  if (model === 'gemini-3.8-flash-tts') {
    const timestamp =
      occurredAt === undefined ? Date.now() : new Date(occurredAt).getTime();
    if (!Number.isFinite(timestamp)) {
      throw new Error('Invalid provider pricing date');
    }
    const promotional = timestamp < GEMINI_38_PROMOTION_ENDS;
    return {
      perInputToken: promotional ? 0.000_000_5 : 0.000_001,
      perOutputToken: promotional ? 0.000_009 : 0.000_018,
    };
  }
  return PRICES[model] ?? {};
}

function count(value: number | string | null | undefined): number {
  const parsed =
    typeof value === 'number' ? value : Number.parseFloat(value ?? '0');
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

export interface SpeechCostInput {
  candidatesTokenCount?: number | string | null;
  inputChars?: number | null;
  /** Provider model that produced the audio. */
  model: string;
  occurredAt?: string | Date;
  promptTokenCount?: number | string | null;
}

/** Provider cost in dollars, to 6 decimals; 0 when the model has no price. */
export function speechProviderCost(input: SpeechCostInput): number {
  const price = priceFor(input.model, input.occurredAt);
  const tokenMicroDollars = Math.round(
    count(input.promptTokenCount) * (price.perInputToken ?? 0) * 1_000_000 +
      count(input.candidatesTokenCount) *
        (price.perOutputToken ?? 0) *
        1_000_000,
  );
  const amount =
    Math.max(0, input.inputChars ?? 0) * (price.perInputChar ?? 0) +
    tokenMicroDollars / 1_000_000;
  return Number.parseFloat(amount.toFixed(6));
}
