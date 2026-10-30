import { normalizeModelId } from '@/data/models';
import type { Preset } from '@/data/presets';
import type {
  getPublicCallCharacters,
  getUserCallCharacters,
} from '@/lib/supabase/queries';

type PublicCharacterRow = NonNullable<
  Awaited<ReturnType<typeof getPublicCallCharacters>>
>[number];
type UserCharacterRow = NonNullable<
  Awaited<ReturnType<typeof getUserCallCharacters>>
>[number];
export type CharacterRow = PublicCharacterRow | UserCharacterRow;

function asSingleRelation<T>(value: unknown): T | null {
  if (Array.isArray(value)) {
    return (value[0] as T) ?? null;
  }
  return (value as T | null) ?? null;
}

function toStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const entries = Object.entries(value).filter(
    ([, entry]) => typeof entry === 'string',
  );
  return Object.fromEntries(entries);
}

function toSessionConfig(value: unknown): {
  audioReferenceId?: string;
  model?: string;
  voice?: string;
  temperature?: number;
  maxOutputTokens?: number | null;
  max_output_tokens?: number | null;
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as {
    audioReferenceId?: string;
    model?: string;
    voice?: string;
    temperature?: number;
    maxOutputTokens?: number | null;
    max_output_tokens?: number | null;
  };
}

export function mapCharacterToPreset(character: CharacterRow): Preset {
  const prompts = asSingleRelation<{
    prompt?: string | null;
    localized_prompts?: Record<string, string> | null;
    type?: 'tts' | 'call' | null;
  }>(character.prompts);
  const voice = asSingleRelation<{
    name?: string | null;
    sample_url?: string | null;
  }>(character.voices);
  const sessionConfig = toSessionConfig(character.session_config);

  return {
    id: character.id,
    image: character.image ?? undefined,
    instructions: prompts?.prompt ?? '',
    isPublic: character.is_public ?? undefined,
    localizedDescriptions: toStringRecord(character.localized_descriptions),
    localizedInstructions: prompts?.localized_prompts ?? {},
    name: character.name,
    promptId: character.prompt_id ?? undefined,
    promptType: prompts?.type ?? undefined,
    sessionConfig: {
      audioReferenceId: sessionConfig.audioReferenceId,
      maxOutputTokens:
        sessionConfig.maxOutputTokens ??
        sessionConfig.max_output_tokens ??
        null,
      model: normalizeModelId(sessionConfig.model),
      temperature: sessionConfig.temperature ?? 0.8,
      voice: sessionConfig.voice ?? voice?.name ?? 'Ara',
    },
    voiceId: character.voice_id ?? undefined,
    voiceName: sessionConfig.audioReferenceId
      ? sessionConfig.voice
      : (voice?.name ?? undefined),
    voiceSampleUrl: voice?.sample_url ?? undefined,
  };
}
