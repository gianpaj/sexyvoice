import { countWords } from '../text.ts';

/**
 * Speech generation catalog. Each public model id owns every rule that varies
 * by model, so the routes, the dashboard and the external API look rules up
 * here instead of branching on model ids. A stored `voices.model` is active
 * when an entry lists it.
 */

export type TtsProvider = 'gemini' | 'grok' | 'replicate';
export type TtsFormat = 'mp3' | 'wav';

interface TierLimit {
  free: number;
  paid: number;
}

export interface TtsModel {
  /** `/api/estimate-credits` answers for this model. */
  canEstimate: boolean;
  color: string;
  /** `voices.model` values that belong to this model. */
  dbModels: readonly string[];
  /** System prompt for "Improve text", or null when the model has none. */
  enhancePrompt: ((language: string) => string) | null;
  /** Credits reserved before generation. */
  estimateCredits: (text: string, voiceName: string) => number;
  /** Output formats; the first one is the default. */
  formats: readonly [TtsFormat, ...TtsFormat[]];
  /** Inline tags the voice performs, for prompts and the style card. */
  inlineTags: (language: string) => string | undefined;
  /** Voice picker label and badge colour. */
  label: string;
  /** External API display name. */
  name: string;
  provider: TtsProvider;
  /** Generation settings the provider honours. */
  settings: {
    language: boolean;
    seed: boolean;
    speed: boolean;
    temperature: boolean;
  };
  /** Maximum delivery-style characters, or null when the model has no style. */
  styleLimit: TierLimit | null;
  /** Maximum transcript characters per request. */
  textLimit: TierLimit;
}

/** Retired catalogs stay in the database for audio history joins. */
const RETIRED_TTS_MODELS: readonly string[] = ['gpro', 'gpro31'];

/** PostgREST value for `.not('model', 'in', ...)`. */
export const RETIRED_TTS_MODELS_FILTER = `(${RETIRED_TTS_MODELS.join(',')})`;

/** About 10 credits per second of speech, read at 100 words a minute. */
export function estimateSpeechCredits(
  text: string,
  multiplier: number,
): number {
  const words = countWords(text);
  if (words === 0) {
    return 0;
  }
  const wordsPerSecond = 100 / 60;
  return Math.ceil((words / wordsPerSecond) * 10 * multiplier);
}

/** Final charge for token-metered generations (Gemini): 1.1 credits a token. */
export function creditsFromTokens(tokenCount: number): number {
  return Math.ceil(Math.max(0, tokenCount) * 1.1);
}

// Gemini 3.8 inline vocal tags. English tags apply to every transcript language.
// https://ai.google.dev/gemini-api/docs/speech-generation
export const GEMINI_38_AUDIO_TAGS =
  '<argh>, <breath>, <heavy breath>, <exhales>, <cackle>, <cheer>, <chuckle>, <chuckles>, <cough>, <cry>, <gasp>, <giggle>, <groan>, <growl>, <grunt>, <grr>, <hiss>, <laugh>, <laughter>, <moan>, <pant>, <pff>, <phew>, <scream>, <shout>, <shriek>, <sigh>, <sighs>, <sneeze>, <snicker>, <snort>, <sob>, <throat-clearing>, <tsk>, <whimper>, <whispers>, <whispering>, <yawn>, <short pause>, <long pause>';

// Gemini 3.8 reads the text as a verbatim transcript: only angle-bracket
// vocal tags are performed, and delivery directions belong in the style field.
const GEMINI_38_ENHANCE_PROMPT = `You are an expert at enhancing text for AI voice generation with Gemini 3.8 TTS.
The model reads the text as a verbatim transcript, so anything you add is spoken aloud unless it is a supported vocal tag.

Available tags: ${GEMINI_38_AUDIO_TAGS}

Rules:
1. Tags are momentary non-speech sounds. Place each one inline at the exact point the sound should happen, e.g. "<sigh> I told you. <short pause> Fine, come in."
2. Use only tags from the list, written exactly as shown. Keep tags in English even when the text is in another language.
3. Do not add delivery directions such as tone, emotion, or pace, and never use square brackets. Those belong in the separate style field.
4. Use tags sparingly, at most 1-2 per sentence
5. Keep the original text completely intact, only add tags
6. Return only the enhanced text with tags, no explanations`;

// Orpheus voice languages are stored like `es-ES 🇪🇸`; tags vary by language.
const ORPHEUS_TAGS: Record<string, string> = {
  en: '<laugh>, <chuckle>, <sigh>, <cough>, <sniffle>, <groan>, <yawn>, <gasp>',
  es: '<groan>, <chuckle>, <gasp>, <resoplido>, <laugh>, <yawn>, <cough>',
  it: '<sigh>, <laugh>, <cough>, <sniffle>, <groan>, <yawn>, <gemito>, <gasp>',
};

function orpheusTags(language: string): string | undefined {
  const code = Object.keys(ORPHEUS_TAGS).find((prefix) =>
    language.startsWith(`${prefix}-`),
  );
  return code ? ORPHEUS_TAGS[code] : undefined;
}

function orpheusEnhancePrompt(language: string): string {
  return `Below is a text. The text is missing annotations for a voice actor.
You are an expert at enhancing text for AI voice generation. Your task is to add emotion tags to make the voice output more expressive and engaging.

Add emotion tags: '${orpheusTags(language)}'. ONLY THESE exist

Rules:
1. Add emotion tags strategically to enhance the meaning and flow. Those are the only ones that exist
2. Don't overuse tags - use them sparingly but effectively
3. Consider the context and tone of the original text
4. Keep the original text intact, only add emotion tags
5. Use tags that would make sense for voice generation
6. Return only the enhanced text with emotion tags, no explanations`;
}

// The Spanish and Italian Orpheus voices cost twice the English ones.
const ORPHEUS_SPANISH_ITALIAN_VOICES = new Set([
  'carlo',
  'giulia',
  'javi',
  'maria',
  'pietro',
  'sergio',
]);

const NO_SETTINGS: TtsModel['settings'] = {
  language: false,
  seed: false,
  speed: false,
  temperature: false,
};

const MODELS = {
  gpro38: {
    canEstimate: true,
    color: '#72B5E9',
    dbModels: ['gpro38'],
    enhancePrompt: () => GEMINI_38_ENHANCE_PROMPT,
    estimateCredits: (text: string) => estimateSpeechCredits(text, 1.1),
    formats: ['wav'],
    inlineTags: () => GEMINI_38_AUDIO_TAGS,
    label: 'Gemini 3.8',
    name: 'Gemini 3.8 Flash TTS',
    provider: 'gemini',
    settings: { ...NO_SETTINGS, seed: true, temperature: true },
    styleLimit: { free: 1000, paid: 2500 },
    textLimit: { free: 500, paid: 1000 },
  },
  orpheus: {
    canEstimate: false,
    color: '#EEBB2D',
    dbModels: [
      'gianpaj/cog-orpheus-3b-0.1-ft:666dc0c400952f2c18f0a46233dca2053ebef622754769878cd5497e20714650',
      'lucataco/orpheus-3b-0.1-ft:79f2a473e6a9720716a473d9b2f2951437dbf91dc02ccb7079fb3d89b881207f',
    ],
    enhancePrompt: orpheusEnhancePrompt,
    estimateCredits: (text: string, voiceName: string) =>
      estimateSpeechCredits(
        text,
        ORPHEUS_SPANISH_ITALIAN_VOICES.has(voiceName) ? 8 : 4,
      ),
    formats: ['mp3'],
    inlineTags: orpheusTags,
    label: 'Replicate',
    name: 'Orpheus (Replicate)',
    provider: 'replicate',
    settings: NO_SETTINGS,
    styleLimit: null,
    textLimit: { free: 500, paid: 500 },
  },
  xai: {
    canEstimate: true,
    color: '#65B88F',
    dbModels: ['xai'],
    enhancePrompt: null,
    // About one credit per character, billed in 100-character buckets.
    estimateCredits: (text: string) =>
      text.trim() ? Math.ceil(text.length / 100) * 100 : 0,
    formats: ['mp3', 'wav'],
    inlineTags: () => undefined,
    label: 'Grok',
    name: 'Grok (xAI)',
    provider: 'grok',
    settings: { ...NO_SETTINGS, language: true, speed: true },
    styleLimit: null,
    textLimit: { free: 500, paid: 1000 },
  },
} satisfies Record<string, TtsModel>;

export type TtsModelId = keyof typeof MODELS;

export const TTS_MODELS: Readonly<Record<TtsModelId, TtsModel>> = MODELS;

export const TTS_MODEL_IDS = Object.keys(TTS_MODELS) as [
  TtsModelId,
  ...TtsModelId[],
];

const MODEL_ID_BY_DB_MODEL = new Map<string, TtsModelId>(
  TTS_MODEL_IDS.flatMap((id) =>
    TTS_MODELS[id].dbModels.map((dbModel) => [dbModel, id] as const),
  ),
);

/** Public model id for a stored `voices.model`; undefined when retired or unknown. */
export function getTtsModelId(
  dbModel: string | null | undefined,
): TtsModelId | undefined {
  return dbModel ? MODEL_ID_BY_DB_MODEL.get(dbModel) : undefined;
}

/** Catalog entry for a stored `voices.model`; undefined when retired or unknown. */
export function getTtsModel(
  dbModel: string | null | undefined,
): TtsModel | undefined {
  const id = getTtsModelId(dbModel);
  return id ? TTS_MODELS[id] : undefined;
}

export function isActiveTtsModel(dbModel: string): boolean {
  return MODEL_ID_BY_DB_MODEL.has(dbModel);
}

export function getTextLimit(model: TtsModel, isPaidUser: boolean): number {
  return isPaidUser ? model.textLimit.paid : model.textLimit.free;
}

export function getStyleLimit(
  model: TtsModel,
  isPaidUser: boolean,
): number | null {
  if (!model.styleLimit) {
    return null;
  }
  return isPaidUser ? model.styleLimit.paid : model.styleLimit.free;
}
