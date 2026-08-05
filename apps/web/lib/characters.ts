import { normalizeModelId } from '@/data/models';
import type { Preset } from '@/data/presets';

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
  id: string;
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
      maxOutputTokens:
        sessionConfig.maxOutputTokens ??
        sessionConfig.max_output_tokens ??
        null,
      model: normalizeModelId(sessionConfig.model),
      temperature: sessionConfig.temperature ?? 0.8,
      voice: sessionConfig.voice ?? character.voices?.name ?? 'Ara',
    },
    voiceId: character.voice_id,
    voiceName: character.voices?.name ?? undefined,
    voiceSampleUrl: character.voices?.sample_url ?? undefined,
  };
}

// ─── Payload builder ─────────────────────────────────────────────────────────

/**
 * Builds the payload for saving/updating a custom character via POST /api/characters.
 */
export function buildSaveCharacterPayload(
  preset: Preset,
  language: string,
  instructions: string,
): SaveCharacterPayload {
  // Filter out undefined values from Partial<Record<string, string>> fields
  const filterDefined = (
    obj: Partial<Record<string, string>> | undefined,
  ): Partial<Record<string, string>> =>
    Object.fromEntries(
      Object.entries(obj ?? {}).filter(([, v]) => v !== undefined),
    );

  return {
    id: preset.id,
    localizedDescriptions: filterDefined(preset.localizedDescriptions),
    localizedPrompts: {
      ...filterDefined(preset.localizedInstructions),
      [language]: instructions,
    },
    name: preset.name,
    prompt: instructions,
    sessionConfig: preset.sessionConfig,
    voiceName: preset.voiceName ?? preset.sessionConfig.voice,
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

// ─── Dirty check ─────────────────────────────────────────────────────────────

/**
 * Returns true if the given instructions differ from what is persisted
 * for the character in the given language.
 */
export function isInstructionsDirty(
  preset: Preset,
  language: string,
  currentInstructions: string,
): boolean {
  const savedInstructions =
    preset.localizedInstructions?.[language] ?? preset.instructions ?? '';
  return currentInstructions !== savedInstructions;
}
