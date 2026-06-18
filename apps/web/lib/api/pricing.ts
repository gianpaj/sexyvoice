type ExternalSourceType = 'api_tts' | 'api_voice_cloning' | 'tts';
type ExternalProvider = 'google' | 'replicate' | 'xai';
type ExternalModel = 'gpro' | 'orpheus' | string;

interface PricingInput {
  candidatesTokenCount?: number | string | null;
  durationSeconds?: number | null;
  inputChars?: number | null;
  model?: ExternalModel | null;
  outputChars?: number | null;
  promptTokenCount?: number | string | null;
  provider: ExternalProvider;
  sourceType: ExternalSourceType;
}

interface PriceConfig {
  perInputChar?: number;
  perInputToken?: number;
  perMinute?: number;
  perOutputChar?: number;
  perOutputToken?: number;
  perRequest?: number;
}

const ZERO_PRICE: PriceConfig = {};

const PRICING_TABLE: Record<string, PriceConfig> = {
  // Dashboard text-to-speech
  'tts:xai:xai': {
    perInputChar: 0.000_004_2,
  },

  // Text-to-speech API
  'api_tts:google:gemini-2.5-pro-preview-tts': {
    perInputToken: 0.000_001,
    perOutputToken: 0.000_02,
  },
  'api_tts:google:gemini-3.1-flash-tts-preview': {
    perInputToken: 0.000_001,
    perOutputToken: 0.000_02,
  },
  'api_tts:google:gemini-2.5-flash-preview-tts': {
    perInputToken: 0.000_000_5,
    perOutputToken: 0.000_01,
  },
  'api_tts:replicate:lucataco/orpheus-3b-0.1-ft:79f2a473e6a9720716a473d9b2f2951437dbf91dc02ccb7079fb3d89b881207f': {
    perInputChar: 0.000_015,
  },
  'api_tts:replicate:gianpaj/cog-orpheus-3b-0.1-ft:666dc0c400952f2c18f0a46233dca2053ebef622754769878cd5497e20714650': {
    perInputChar: 0.000_015,
  },
  'api_tts:xai:xai': {
    perInputChar: 0.000_015,
  },
  'api_voice_cloning:replicate:*': {},
};

function getPriceConfig({
  sourceType,
  provider,
  model,
}: Pick<PricingInput, 'sourceType' | 'provider' | 'model'>): PriceConfig {
  const modelKey = model ?? '*';
  const sourceKey = `${sourceType}:${provider}:${modelKey}`;
  const wildcardKey = `${sourceType}:${provider}:*`;
  const sharedProviderModelKey = `api_tts:${provider}:${modelKey}`;

  return (
    PRICING_TABLE[sourceKey] ??
    PRICING_TABLE[wildcardKey] ??
    PRICING_TABLE[sharedProviderModelKey] ??
    ZERO_PRICE
  );
}

function normalizeUnitCount(value: number | string | null | undefined): number {
  const parsedValue =
    typeof value === 'number' ? value : Number.parseFloat(value ?? '0');

  if (!Number.isFinite(parsedValue)) {
    return 0;
  }

  return Math.max(0, parsedValue);
}

export function calculateGenerateApiDollarAmount(input: PricingInput): number {
  const config = getPriceConfig(input);
  const inputChars = Math.max(0, input.inputChars ?? 0);
  const outputChars = Math.max(0, input.outputChars ?? 0);
  const promptTokenCount = normalizeUnitCount(input.promptTokenCount);
  const candidatesTokenCount = normalizeUnitCount(input.candidatesTokenCount);
  const durationSeconds = Math.max(0, input.durationSeconds ?? 0);
  const durationMinutes = durationSeconds / 60;

  const tokenMicroDollarAmount = Math.round(
    promptTokenCount * (config.perInputToken ?? 0) * 1_000_000 +
      candidatesTokenCount * (config.perOutputToken ?? 0) * 1_000_000,
  );
  const rawAmount =
    inputChars * (config.perInputChar ?? 0) +
    outputChars * (config.perOutputChar ?? 0) +
    tokenMicroDollarAmount / 1_000_000 +
    durationMinutes * (config.perMinute ?? 0) +
    (config.perRequest ?? 0);

  return Number.parseFloat(rawAmount.toFixed(6));
}
