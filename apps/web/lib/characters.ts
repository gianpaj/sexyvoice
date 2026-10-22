import { normalizeModelId } from '@/data/models';
import type { Preset } from '@/data/presets';
import { savedVoiceSampleUrl } from '@/lib/call-voices';

export const MAX_CUSTOM_CHARACTERS = 10;

// ─── API response shape (from POST /api/characters) ───────────────────────────

export interface ApiCharacterResponse {
  id: string;
  image?: string | null;
  is_public?: boolean;
  localized_descriptions?: Record<string, string> | null;
  name: string;
  prompt_id?: string;
  prompts?: {
    prompt?: string | null;
    localized_prompts?: Record<string, string> | null;
  } | null;
  session_config?: {
    audioReferenceId?: string;
    model?: string;
    voice?: string;
    temperature?: number;
    maxOutputTokens?: number | null;
    max_output_tokens?: number | null;
  } | null;
  sort_order?: number;
  voice_id?: string;
  voices?: { name?: string | null; sample_url?: string | null } | null;
}

// ─── API request payload (sent to POST /api/characters) ───────────────────────

export interface SaveCharacterPayload {
  id?: string;
  localizedDescriptions: Partial<Record<string, string>>;
  localizedPrompts: Partial<Record<string, string>>;
  name: string;
  prompt: string;
  sessionConfig: Preset['sessionConfig'];
  voiceName: string;
}

// ─── Mapper ───────────────────────────────────────────────────────────────────

export function mapApiCharacterToPreset(
  character: ApiCharacterResponse,
): Preset {
  const sessionConfig = character.session_config ?? {};

  return {
    id: character.id,
    image: character.image ?? undefined,
    instructions: character.prompts?.prompt ?? '',
    isPublic: character.is_public,
    localizedDescriptions: character.localized_descriptions ?? {},
    localizedInstructions: character.prompts?.localized_prompts ?? {},
    name: character.name,
    promptId: character.prompt_id,
    sessionConfig: {
      audioReferenceId: sessionConfig.audioReferenceId,
      maxOutputTokens:
        sessionConfig.maxOutputTokens ??
        sessionConfig.max_output_tokens ??
        null,
      model: normalizeModelId(sessionConfig.model),
      temperature: sessionConfig.temperature ?? 0.8,
      voice: sessionConfig.voice ?? character.voices?.name ?? 'Ara',
    },
    voiceId: character.voice_id,
    voiceName: sessionConfig.audioReferenceId
      ? sessionConfig.voice
      : (character.voices?.name ?? undefined),
    voiceSampleUrl: character.voices?.sample_url ?? undefined,
  };
}

// ─── Payload builder ─────────────────────────────────────────────────────────

const definedEntries = (
  record: Partial<Record<string, string>> | undefined,
): Partial<Record<string, string>> =>
  Object.fromEntries(
    Object.entries(record ?? {}).filter(([, value]) => value !== undefined),
  );

/**
 * Builds the POST /api/characters payload from the creator's fields. `base`
 * is the user's own character being edited or duplicated: its other
 * languages are kept, and only an English edit replaces its default prompt.
 * `id` is sent only when `update` is set; without it the API creates a copy.
 */
export function buildSaveCharacterPayload({
  base,
  description,
  instructions,
  language,
  name,
  sessionConfig,
  update = false,
}: {
  base?: Preset;
  description: string;
  instructions: string;
  language: string;
  name: string;
  sessionConfig: Preset['sessionConfig'];
  update?: boolean;
}): SaveCharacterPayload {
  return {
    ...(update && base ? { id: base.id } : {}),
    localizedDescriptions: {
      ...definedEntries(base?.localizedDescriptions),
      [language]: description,
    },
    localizedPrompts: {
      ...definedEntries(base?.localizedInstructions),
      [language]: instructions,
    },
    name,
    prompt:
      language === 'en' || !base?.instructions
        ? instructions
        : base.instructions,
    sessionConfig,
    voiceName: sessionConfig.voice,
  };
}

// ─── API helper ──────────────────────────────────────────────────────────────

export type SaveCharacterResult =
  | { ok: true; preset: Preset }
  | { ok: false; error: string };

/**
 * POSTs a character payload to /api/characters and returns the mapped Preset.
 * Does NOT dispatch to the store or show toasts — callers handle those concerns.
 */
export async function saveCharacter(
  payload: SaveCharacterPayload,
): Promise<SaveCharacterResult> {
  try {
    const response = await fetch('/api/characters', {
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });

    const data: ApiCharacterResponse & { error?: string } =
      await response.json();

    if (!response.ok) {
      return { error: data.error ?? 'Failed to save character', ok: false };
    }

    return { ok: true, preset: mapApiCharacterToPreset(data) };
  } catch {
    return { error: 'Failed to save character', ok: false };
  }
}

// ─── Localized fields ───────────────────────────────────────────────────────

/** The character's description in `language`, falling back to English. */
export function getPresetDescription(preset: Preset, language: string): string {
  return (
    preset.localizedDescriptions?.[language] ??
    preset.localizedDescriptions?.en ??
    ''
  );
}

/** The character's prompt in `language`, falling back to its default prompt. */
export function getPresetInstructions(
  preset: Preset | undefined,
  language: string,
): string {
  return (
    preset?.localizedInstructions?.[language] ?? preset?.instructions ?? ''
  );
}

/** Sample of the voice the character calls with. */
export function getPresetSampleUrl(preset: Preset): string | null {
  const { audioReferenceId } = preset.sessionConfig;
  if (audioReferenceId) return savedVoiceSampleUrl(audioReferenceId);
  return preset.voiceSampleUrl ?? null;
}
