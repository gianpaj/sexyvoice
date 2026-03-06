type ExternalSourceType = 'api_tts' | 'api_voice_cloning';
type ExternalProvider = 'google' | 'replicate';
type ExternalModel = 'gpro' | 'orpheus' | string;

interface PricingInput {
  sourceType: ExternalSourceType;
  provider: ExternalProvider;
  model?: ExternalModel | null;
  inputChars?: number | null;
  outputChars?: number | null;
  durationSeconds?: number | null;
}

interface PriceConfig {
  perInputChar: number;
  perOutputChar: number;
  perMinute: number;
  perRequest: number;
}

const ZERO_PRICE: PriceConfig = {
  perInputChar: 0,
  perOutputChar: 0,
  perMinute: 0,
  perRequest: 0,
};

const PRICING_TABLE: Record<string, PriceConfig> = {
  // Text-to-speech API
  'api_tts:google:gpro': {
    perInputChar: 0.000_02,
    perOutputChar: 0,
    perMinute: 0,
    perRequest: 0,
  },
  'api_tts:replicate:orpheus': {
    perInputChar: 0.000_015,
    perOutputChar: 0,
    perMinute: 0,
    perRequest: 0,
  },
  'api_voice_cloning:replicate:*': {
    perInputChar: 0,
    perOutputChar: 0,
    perMinute: 0,
    perRequest: 0,
  },
};

function getPriceConfig({
  sourceType,
  provider,
  model,
}: Pick<PricingInput, 'sourceType' | 'provider' | 'model'>): PriceConfig {
  const modelKey = model ?? '*';
  return (
    PRICING_TABLE[`${sourceType}:${provider}:${modelKey}`] ??
    PRICING_TABLE[`${sourceType}:${provider}:*`] ??
    ZERO_PRICE
  );
}

export function calculateExternalApiDollarAmount(input: PricingInput): number {
  const config = getPriceConfig(input);
  const inputChars = Math.max(0, input.inputChars ?? 0);
  const outputChars = Math.max(0, input.outputChars ?? 0);
  const durationSeconds = Math.max(0, input.durationSeconds ?? 0);
  const durationMinutes = durationSeconds / 60;

  const rawAmount =
    inputChars * config.perInputChar +
    outputChars * config.perOutputChar +
    durationMinutes * config.perMinute +
    config.perRequest;

  return Number.parseFloat(rawAmount.toFixed(6));
}
