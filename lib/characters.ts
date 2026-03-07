import type { Preset } from '@/data/presets';

// ─── API response shape (from POST /api/characters) ───────────────────────────

export interface ApiCharacterResponse {
  id: string;
  name: string;
  localized_descriptions?: Record<string, string> | null;
  image?: string | null;
  session_config?: {
    model?: string;
    voice?: string;
    temperature?: number;
    max_output_tokens?: number | null;
    grok_image_enabled?: boolean;
  } | null;
  sort_order?: number;
  is_public?: boolean;
  voice_id?: string;
  voices?: { name?: string | null; sample_url?: string | null } | null;
  prompt_id?: string;
  prompts?: {
    prompt?: string | null;
    localized_prompts?: Record<string, string> | null;
  } | null;
}

// ─── API request payload (sent to POST /api/characters) ───────────────────────

export interface SaveCharacterPayload {
  id: string;
  name: string;
  localizedDescriptions: Partial<Record<string, string>>;
  prompt: string;
  localizedPrompts: Partial<Record<string, string>>;
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
    name: character.name,
    localizedDescriptions: character.localized_descriptions ?? {},
    image: character.image ?? undefined,
    instructions: character.prompts?.prompt ?? '',
    localizedInstructions: character.prompts?.localized_prompts ?? {},
    sessionConfig: {
      model: (sessionConfig.model ??
        'grok-4-1-fast-non-reasoning') as Preset['sessionConfig']['model'],
      voice: sessionConfig.voice ?? character.voices?.name ?? 'Ara',
      temperature: sessionConfig.temperature ?? 0.8,
      maxOutputTokens: sessionConfig.max_output_tokens ?? null,
      grokImageEnabled: sessionConfig.grok_image_enabled ?? false,
    },
    promptId: character.prompt_id,
    voiceId: character.voice_id,
    voiceName: character.voices?.name ?? undefined,
    voiceSampleUrl: character.voices?.sample_url ?? undefined,
    isPublic: character.is_public,
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
    name: preset.name,
    localizedDescriptions: filterDefined(preset.localizedDescriptions),
    prompt: instructions,
    localizedPrompts: {
      ...filterDefined(preset.localizedInstructions),
      [language]: instructions,
    },
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
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data: ApiCharacterResponse & { error?: string } =
      await response.json();

    if (!response.ok) {
      return { ok: false, error: data.error ?? 'Failed to save character' };
    }

    return { ok: true, preset: mapApiCharacterToPreset(data) };
  } catch {
    return { ok: false, error: 'Failed to save character' };
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
