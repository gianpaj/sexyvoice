import type { Metadata } from 'next';

import { RoomWrapper } from '@/components/call/room-wrapper';
import { TooltipProvider } from '@/components/ui/tooltip';
import { normalizeModelId } from '@/data/models';
import type { CallLanguage } from '@/data/playground-state';
import type { Preset } from '@/data/presets';
import { ConnectionProvider } from '@/hooks/use-connection';
import { PlaygroundStateProvider } from '@/hooks/use-playground-state';
import {
  applyPresetInstructionOverrides,
  getCallInstructionConfig,
} from '@/lib/edge-config/call-instructions';
import type { Locale } from '@/lib/i18n/i18n-config';
import { getVerifiedClaims } from '@/lib/supabase/auth';
import {
  getPublicCallCharacters,
  getUserCallCharacters,
  hasUserPaid,
} from '@/lib/supabase/queries';
import { createClient } from '@/lib/supabase/server';

import '@livekit/components-styles';

export const metadata: Metadata = {
  description: 'Real-time voice AI',
};

type PublicCharacterRow = NonNullable<
  Awaited<ReturnType<typeof getPublicCallCharacters>>
>[number];
type UserCharacterRow = NonNullable<
  Awaited<ReturnType<typeof getUserCallCharacters>>
>[number];
type CharacterRow = PublicCharacterRow | UserCharacterRow;

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
    model?: string;
    voice?: string;
    temperature?: number;
    maxOutputTokens?: number | null;
    max_output_tokens?: number | null;
  };
}

function mapCharacterToPreset(character: CharacterRow): Preset {
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
      maxOutputTokens:
        sessionConfig.maxOutputTokens ??
        sessionConfig.max_output_tokens ??
        null,
      model: normalizeModelId(sessionConfig.model),
      temperature: sessionConfig.temperature ?? 0.8,
      voice: sessionConfig.voice ?? voice?.name ?? 'Ara',
    },
    voiceId: character.voice_id ?? undefined,
    voiceName: voice?.name ?? undefined,
    voiceSampleUrl: voice?.sample_url ?? undefined,
  };
}

export default async function CallLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ lang: Locale }>;
}>) {
  const { defaultInstructions, initialInstruction, presetInstructions } =
    await getCallInstructionConfig();

  const supabase = await createClient();
  const claims = await getVerifiedClaims(supabase);
  const userId = claims?.sub;

  const [publicCharacters, isPaidUser] = await Promise.all([
    getPublicCallCharacters(),
    userId ? hasUserPaid(userId) : Promise.resolve(false),
  ]);
  const userCharacters =
    userId && isPaidUser ? await getUserCallCharacters(userId) : [];

  const baseDefaultPresets: Preset[] = (publicCharacters ?? []).map(
    (character) => mapCharacterToPreset(character as CharacterRow),
  );
  const defaultPresets = applyPresetInstructionOverrides(
    baseDefaultPresets,
    presetInstructions,
  );
  const initialCustomCharacters: Preset[] = (userCharacters ?? []).map(
    (character) => mapCharacterToPreset(character as CharacterRow),
  );

  const { lang } = await params;

  return (
    // <PHProvider>
    <PlaygroundStateProvider
      defaultPresets={defaultPresets}
      initialCustomCharacters={initialCustomCharacters}
      initialState={{
        initialInstruction,
        instructions: defaultInstructions,
        language: lang as CallLanguage,
        selectedPresetId: defaultPresets[0]?.id ?? null,
      }}
    >
      <ConnectionProvider>
        <TooltipProvider>
          <RoomWrapper>{children}</RoomWrapper>
        </TooltipProvider>
      </ConnectionProvider>
    </PlaygroundStateProvider>
  );
}
