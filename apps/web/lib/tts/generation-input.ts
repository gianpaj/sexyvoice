import { getStyleLimit, getTextLimit, type TtsModel } from './models';

type SpeechSettingName = keyof TtsModel['settings'];

interface SpeechSettingRule {
  max?: number;
  min?: number;
  paid: boolean;
  step?: number;
}

/**
 * Generation settings. `TtsModel.settings` says which ones a model honours;
 * paid settings need a paid plan, and numbers are clamped to their range.
 */
export const SPEECH_SETTINGS = {
  language: { paid: false },
  seed: { min: 0, paid: true },
  speed: { max: 1.5, min: 0.7, paid: false, step: 0.05 },
  temperature: { max: 2, min: 0, paid: true, step: 0.1 },
} as const satisfies Record<SpeechSettingName, SpeechSettingRule>;

interface SpeechSettings {
  /** Grok language, `auto` included. */
  language?: string;
  seed?: number;
  speed?: number;
  temperature?: number;
}

interface GenerationInput {
  isPaidUser: boolean;
  /** Requested settings, unchecked: a request body or the stored settings. */
  settings?: Partial<Record<SpeechSettingName, unknown>>;
  style?: string;
  text?: string;
}

interface GenerationInputCheck {
  /** Settings the model honours and the user may set, clamped to range. */
  settings: SpeechSettings;
  /** The delivery style, or undefined when the model takes none. */
  style: string | undefined;
  styleLimit: number | null;
  styleTooLong: boolean;
  textLimit: number;
  textTooLong: boolean;
}

export function canUseSpeechSetting(
  model: TtsModel,
  setting: SpeechSettingName,
  isPaidUser: boolean,
): boolean {
  return (
    model.settings[setting] && (isPaidUser || !SPEECH_SETTINGS[setting].paid)
  );
}

/** A random seed for a fresh take. */
export function randomSeed(): number {
  return Math.floor(1_000_000 + Math.random() * 9_000_000);
}

function clamp(value: unknown, range: { max: number; min: number }) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return;
  }
  return Math.min(range.max, Math.max(range.min, value));
}

/**
 * The generation rules every surface shares: tier text and style limits and
 * the accepted settings. Each surface turns a failed check into its own
 * response.
 */
export function validateGenerationInput(
  model: TtsModel,
  { isPaidUser, settings = {}, style, text = '' }: GenerationInput,
): GenerationInputCheck {
  const textLimit = getTextLimit(model, isPaidUser);
  const styleLimit = getStyleLimit(model, isPaidUser);
  const canUse = (setting: SpeechSettingName) =>
    canUseSpeechSetting(model, setting, isPaidUser);
  const { language, seed } = settings;

  return {
    settings: {
      language:
        canUse('language') && typeof language === 'string' && language
          ? language
          : undefined,
      seed:
        canUse('seed') &&
        typeof seed === 'number' &&
        Number.isSafeInteger(seed) &&
        seed >= SPEECH_SETTINGS.seed.min
          ? seed
          : undefined,
      speed: canUse('speed')
        ? clamp(settings.speed, SPEECH_SETTINGS.speed)
        : undefined,
      temperature: canUse('temperature')
        ? clamp(settings.temperature, SPEECH_SETTINGS.temperature)
        : undefined,
    },
    style: styleLimit === null ? undefined : (style ?? ''),
    styleLimit,
    styleTooLong: styleLimit !== null && (style?.length ?? 0) > styleLimit,
    textLimit,
    textTooLong: text.length > textLimit,
  };
}
