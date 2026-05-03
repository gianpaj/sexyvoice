export type XaiTtsCodec = 'mp3' | 'wav';

export interface GenerateXaiTtsInput {
  codec?: XaiTtsCodec;
  language: string;
  signal?: AbortSignal;
  text: string;
  voiceId: string;
}

export interface GenerateXaiTtsResult {
  audioBuffer: Buffer;
  codec: XaiTtsCodec;
  contentType: string;
  /** Raw cost value from xAI response usage object (1 tick = $0.000_000_001 USD) */
  costInUsdTicks?: number;
}

interface XaiTtsJsonResponse {
  audio?: string;
  usage?: {
    cost_in_usd_ticks?: number;
    characters?: number;
  };
}

const XAI_TTS_URL = 'https://api.x.ai/v1/tts';
const DEFAULT_XAI_TTS_CODEC: XaiTtsCodec = 'mp3';

const XAI_LANGUAGE_MAP: Record<string, string> = {
  ar: 'ar-SA',
  'ar-eg': 'ar-EG',
  'ar-sa': 'ar-SA',
  'ar-ae': 'ar-AE',
  bn: 'bn',
  zh: 'zh',
  fr: 'fr',
  de: 'de',
  hi: 'hi',
  id: 'id',
  it: 'it',
  ja: 'ja',
  ko: 'ko',
  pt: 'pt-BR',
  'pt-br': 'pt-BR',
  'pt-pt': 'pt-PT',
  ru: 'ru',
  es: 'es-ES',
  'es-es': 'es-ES',
  'es-mx': 'es-MX',
  tr: 'tr',
  vi: 'vi',
  en: 'en',
};

export function normalizeXaiTtsCodec(codec?: string): XaiTtsCodec {
  if (codec === 'wav') {
    return 'wav';
  }

  return DEFAULT_XAI_TTS_CODEC;
}

export function getXaiContentType(codec: XaiTtsCodec): string {
  switch (codec) {
    case 'wav':
      return 'audio/wav';
    // case 'mp3':
    default:
      return 'audio/mpeg';
  }
}

export function getXaiFileExtension(codec: XaiTtsCodec): string {
  return codec;
}

export function normalizeXaiTtsLanguage(language?: string): string {
  if (!language) {
    return 'auto';
  }

  const normalized = language.trim();

  if (!normalized) {
    return 'auto';
  }

  if (normalized.toLowerCase() === 'multiple') {
    return 'auto';
  }

  const directMatch = XAI_LANGUAGE_MAP[normalized.toLowerCase()];
  if (directMatch) {
    return directMatch;
  }

  const primarySubtag = normalized.split('-')[0]?.toLowerCase();
  if (!primarySubtag) {
    return 'auto';
  }

  return XAI_LANGUAGE_MAP[primarySubtag] ?? 'auto';
}

export async function generateXaiTts({
  text,
  voiceId,
  language,
  codec,
  signal,
}: GenerateXaiTtsInput): Promise<GenerateXaiTtsResult> {
  const apiKey = process.env.XAI_API_KEY;

  if (!apiKey) {
    throw new Error('Missing XAI_API_KEY', {
      cause: 'XAI_TTS_ERROR',
    });
  }

  const normalizedCodec = normalizeXaiTtsCodec(codec);
  const normalizedLanguage = normalizeXaiTtsLanguage(language);

  const response = await fetch(XAI_TTS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      voice_id: voiceId,
      language: normalizedLanguage,
      output_format: {
        codec: normalizedCodec,
      },
    }),
    signal,
  });

  if (!response.ok) {
    const responseText = await response.text();

    throw new Error(
      `xAI TTS request failed with status ${response.status}: ${responseText}`,
      {
        cause: 'XAI_TTS_ERROR',
      },
    );
  }

  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    const json = (await response.json()) as XaiTtsJsonResponse;
    const audioBase64 = json.audio;
    if (!audioBase64) {
      throw new Error('xAI TTS JSON response missing audio field', {
        cause: 'XAI_TTS_ERROR',
      });
    }
    const audioBuffer = Buffer.from(audioBase64, 'base64');
    return {
      audioBuffer,
      codec: normalizedCodec,
      contentType: getXaiContentType(normalizedCodec),
      costInUsdTicks: json.usage?.cost_in_usd_ticks,
    };
  }

  const audioBuffer = Buffer.from(await response.arrayBuffer());

  return {
    audioBuffer,
    codec: normalizedCodec,
    contentType: getXaiContentType(normalizedCodec),
  };
}
