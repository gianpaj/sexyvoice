import type { SupabaseClient } from '@supabase/supabase-js';

import {
  type SavedCallVoice,
  savedVoiceMissing,
  savedVoiceSampleUrl,
} from '@/lib/calls/voices';
import { DEFAULT_CALL_LANGUAGE } from './languages';
import {
  type CallModelId,
  DEFAULT_CALL_MODEL,
  normalizeCallModel,
} from './models';

export const MAX_CUSTOM_CHARACTERS = 10;
export const MAX_CHARACTER_NAME_LENGTH = 50;
export const MAX_CHARACTER_DESCRIPTION_LENGTH = 200;
export const MAX_CHARACTER_PROMPT_LENGTH = 5000;

/** Call settings a character saves in `characters.session_config`. */
export interface SessionConfig {
  /** An owned saved voice. Built-in voices have none. */
  audioReferenceId?: string;
  maxOutputTokens: number | null;
  model: CallModelId;
  temperature: number;
  /** The built-in voice's name, or the saved voice's name. */
  voice: string;
}

export const DEFAULT_SESSION_CONFIG: Readonly<SessionConfig> = {
  maxOutputTokens: null,
  model: DEFAULT_CALL_MODEL,
  temperature: 0.8,
  voice: 'Ara',
};

/** A prompt and a voice for an AI call persona. */
export interface Character {
  id: string;
  /** File name under `/characters/`. */
  image?: string;
  /** Predefined characters are public; their prompts stay on the server. */
  isPublic: boolean;
  localizedDescriptions: Partial<Record<string, string>>;
  localizedPrompts: Partial<Record<string, string>>;
  /** Language code to a recording of the character introducing itself. */
  localizedSampleUrls: Partial<Record<string, string>>;
  name: string;
  /** The default prompt; empty for a predefined character in the browser. */
  prompt: string;
  sessionConfig: SessionConfig;
  /** Sample of the built-in voice. */
  voiceSampleUrl?: string;
}

/**
 * Character columns every view reads. `voice_id` exists for the voices
 * foreign key and the sample join: built-in voices are resolved from
 * `session_config.voice` when a character is saved, and saved voices point at
 * a shared placeholder row. Calls read the voice from `session_config`.
 */
const CHARACTER_COLUMNS =
  'id, name, image, is_public, localized_descriptions, localized_sample_urls, session_config, voices ( sample_url )';

/** Predefined characters, without their prompt text. */
export const PUBLIC_CHARACTER_COLUMNS = CHARACTER_COLUMNS;

/** A user's own characters, with the prompts they edit. */
export const OWN_CHARACTER_COLUMNS =
  `${CHARACTER_COLUMNS}, prompts ( prompt, localized_prompts )` as const;

/** A character for call-token, with its owner and prompts. Server only. */
export const CALL_CHARACTER_COLUMNS =
  `${OWN_CHARACTER_COLUMNS}, user_id` as const;

export type CharacterRow = Pick<
  Tables<'characters'>,
  | 'id'
  | 'image'
  | 'is_public'
  | 'localized_descriptions'
  | 'localized_sample_urls'
  | 'name'
  | 'session_config'
> & {
  prompts?: Pick<Tables<'prompts'>, 'localized_prompts' | 'prompt'> | null;
  voices: Pick<Tables<'voices'>, 'sample_url'> | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function toStringRecord(value: unknown): Partial<Record<string, string>> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => typeof entry === 'string'),
  ) as Record<string, string>;
}

/**
 * Reads a stored `session_config`: normalizes the model, fills defaults and
 * keeps only the keys calls use. `max_output_tokens` is the legacy spelling.
 */
export function parseSessionConfig(value: unknown): SessionConfig {
  const config = isRecord(value) ? value : {};
  const maxOutputTokens = config.maxOutputTokens ?? config.max_output_tokens;
  return {
    ...(typeof config.audioReferenceId === 'string'
      ? { audioReferenceId: config.audioReferenceId }
      : {}),
    maxOutputTokens:
      typeof maxOutputTokens === 'number' ? maxOutputTokens : null,
    model: normalizeCallModel(
      typeof config.model === 'string' ? config.model : null,
    ),
    temperature:
      typeof config.temperature === 'number'
        ? config.temperature
        : DEFAULT_SESSION_CONFIG.temperature,
    voice:
      typeof config.voice === 'string'
        ? config.voice
        : DEFAULT_SESSION_CONFIG.voice,
  };
}

export function toCharacter(row: CharacterRow): Character {
  return {
    id: row.id,
    image: row.image ?? undefined,
    isPublic: row.is_public,
    localizedDescriptions: toStringRecord(row.localized_descriptions),
    localizedPrompts: toStringRecord(row.prompts?.localized_prompts),
    localizedSampleUrls: toStringRecord(row.localized_sample_urls),
    name: row.name,
    prompt: row.prompts?.prompt ?? '',
    sessionConfig: parseSessionConfig(row.session_config),
    voiceSampleUrl: row.voices?.sample_url ?? undefined,
  };
}

/** The description in `language`, else English. */
export function characterDescription(
  character: Pick<Character, 'localizedDescriptions'>,
  language: string,
): string {
  return (
    character.localizedDescriptions[language] ??
    character.localizedDescriptions[DEFAULT_CALL_LANGUAGE] ??
    ''
  );
}

/**
 * The prompt for a call in `language`: the localized prompt, else the
 * default one. An empty localized prompt falls back too.
 */
export function characterPrompt(
  character: Pick<Character, 'localizedPrompts' | 'prompt'>,
  language: string,
): string {
  return character.localizedPrompts[language] || character.prompt;
}

/**
 * Sample for a character's Listen button: its saved voice, else its intro in
 * the call language (or English), else the sample of its built-in voice.
 */
export function characterSampleUrl(
  character: Pick<
    Character,
    'localizedSampleUrls' | 'sessionConfig' | 'voiceSampleUrl'
  >,
  language: string = DEFAULT_CALL_LANGUAGE,
): string | null {
  const { audioReferenceId } = character.sessionConfig;
  if (audioReferenceId) return savedVoiceSampleUrl(audioReferenceId);
  return (
    character.localizedSampleUrls[language] ??
    character.localizedSampleUrls[DEFAULT_CALL_LANGUAGE] ??
    character.voiceSampleUrl ??
    null
  );
}

/**
 * What stops a character from calling. The panel's Start call and a card's
 * Call both use this, so they never disagree. Predefined characters keep
 * their prompts on the server, so they never miss one.
 */
export function callReadiness(
  character: Pick<
    Character,
    'isPublic' | 'localizedPrompts' | 'prompt' | 'sessionConfig'
  >,
  language: string,
  savedVoices: Pick<SavedCallVoice, 'id'>[],
) {
  const voiceMissing = savedVoiceMissing(character.sessionConfig, savedVoices);
  const personalityMissing = !(
    character.isPublic || characterPrompt(character, language).trim()
  );
  return {
    canCall: !(voiceMissing || personalityMissing),
    personalityMissing,
    voiceMissing,
  };
}

/** A character the creator has not saved yet. */
export interface CharacterDraft {
  description: string;
  name: string;
  prompt: string;
  sessionConfig: SessionConfig;
}

export const newCharacterDraft = (
  sessionConfig: SessionConfig = DEFAULT_SESSION_CONFIG,
): CharacterDraft => ({
  description: '',
  name: '',
  prompt: '',
  sessionConfig: { ...sessionConfig },
});

/** The body of `POST /api/characters`. An `id` updates that character. */
export interface SaveCharacterPayload {
  id?: string;
  localizedDescriptions: Partial<Record<string, string>>;
  localizedPrompts: Partial<Record<string, string>>;
  name: string;
  prompt: string;
  sessionConfig: SessionConfig;
}

const definedEntries = (
  record: Partial<Record<string, string>>,
): Partial<Record<string, string>> =>
  Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  );

/**
 * Builds the save payload from the creator's fields. `base` is the user's
 * own character being edited or duplicated: its other languages are kept,
 * and only an English edit replaces its default prompt. `id` is sent only
 * when `update` is set; without it the API creates a copy.
 */
export function buildSaveCharacterPayload({
  base,
  description,
  language,
  name,
  prompt,
  sessionConfig,
  update = false,
}: {
  base?: Character;
  description: string;
  language: string;
  name: string;
  prompt: string;
  sessionConfig: SessionConfig;
  update?: boolean;
}): SaveCharacterPayload {
  return {
    ...(update && base ? { id: base.id } : {}),
    localizedDescriptions: {
      ...definedEntries(base?.localizedDescriptions ?? {}),
      [language]: description,
    },
    localizedPrompts: {
      ...definedEntries(base?.localizedPrompts ?? {}),
      [language]: prompt,
    },
    name,
    prompt:
      language === DEFAULT_CALL_LANGUAGE || !base?.prompt
        ? prompt
        : base.prompt,
    sessionConfig,
  };
}

export type SaveCharacterResult =
  | { character: Character; ok: true }
  | { error: string; ok: false };

/** Creates or updates a character through `POST /api/characters`. */
export async function saveCharacter(
  payload: SaveCharacterPayload,
): Promise<SaveCharacterResult> {
  try {
    const response = await fetch('/api/characters', {
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });
    const data: CharacterRow & { error?: string } = await response.json();
    if (!response.ok) {
      return { error: data.error ?? 'Failed to save character', ok: false };
    }
    return { character: toCharacter(data), ok: true };
  } catch {
    return { error: 'Failed to save character', ok: false };
  }
}

/** Deletes a custom character through `DELETE /api/characters`. */
export const deleteCharacter = (id: string) =>
  fetch('/api/characters', {
    body: JSON.stringify({ id }),
    headers: { 'Content-Type': 'application/json' },
    // Lets a delete sent from `pagehide` finish after the page is gone.
    keepalive: true,
    method: 'DELETE',
  });

/**
 * Deletes a user's custom characters, or the one that owns `promptId`, by
 * deleting their prompts: `characters.prompt_id` cascades, so a prompt and
 * its character go in one statement. Returns the deleted prompt ids.
 */
export function deleteCustomCharacters(
  supabase: SupabaseClient<Database>,
  userId: string,
  promptId?: string,
) {
  const query = supabase
    .from('prompts')
    .delete()
    .eq('user_id', userId)
    .eq('type', 'call')
    .eq('is_public', false);
  return (promptId ? query.eq('id', promptId) : query).select('id');
}
