import type { Metadata } from 'next';

// import { NavLogo } from "@/components/custom/nav-logo";
// import { ThemeToggle } from "@/components/custom/theme-toggle";
import { RoomWrapper } from '@/components/call/room-wrapper';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { CallLanguage } from '@/data/playground-state';
import type { Preset } from '@/data/presets';
import { ConnectionProvider } from '@/hooks/use-connection';
import { PlaygroundStateProvider } from '@/hooks/use-playground-state';
import {
  applyPresetInstructionOverrides,
  getCallInstructionConfig,
} from '@/lib/edge-config/call-instructions';
import { getDictionary } from '@/lib/i18n/get-dictionary';
import type { Locale } from '@/lib/i18n/i18n-config';
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
  grokImageEnabled?: boolean;
  grok_image_enabled?: boolean;
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
    grokImageEnabled?: boolean;
    grok_image_enabled?: boolean;
  };
}

function mapCharacterToPreset(character: CharacterRow): Preset {
  const prompts = asSingleRelation<{
    prompt?: string | null;
    localized_prompts?: Record<string, string> | null;
    type?: 'tts' | 'call' | null;
  }>(character.prompts);
  const voice = asSingleRelation<{ name?: string | null; sample_url?: string | null }>(
    character.voices,
  );
  const sessionConfig = toSessionConfig(character.session_config);

  return {
    id: character.id,
    name: character.name,
    localizedDescriptions: toStringRecord(character.localized_descriptions),
    instructions: prompts?.prompt ?? '',
    localizedInstructions: prompts?.localized_prompts ?? {},
    sessionConfig: {
      model: (sessionConfig.model ?? 'grok-4-1-fast-non-reasoning') as Preset['sessionConfig']['model'],
      voice: sessionConfig.voice ?? voice?.name ?? 'Ara',
      temperature: sessionConfig.temperature ?? 0.8,
      maxOutputTokens:
        sessionConfig.maxOutputTokens ?? sessionConfig.max_output_tokens ?? null,
      grokImageEnabled:
        sessionConfig.grokImageEnabled ?? sessionConfig.grok_image_enabled ?? false,
    },
    image: character.image ?? undefined,
    promptId: character.prompt_id ?? undefined,
    promptType: prompts?.type ?? undefined,
    voiceId: character.voice_id ?? undefined,
    voiceName: voice?.name ?? undefined,
    voiceSampleUrl: voice?.sample_url ?? undefined,
    isPublic: character.is_public ?? undefined,
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
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [publicCharacters, isPaidUser] = await Promise.all([
    getPublicCallCharacters(),
    user ? hasUserPaid(user.id) : Promise.resolve(false),
  ]);
  const userCharacters = user && isPaidUser ? await getUserCallCharacters(user.id) : [];

  const baseDefaultPresets: Preset[] = (publicCharacters ?? []).map((character) =>
    mapCharacterToPreset(character as CharacterRow),
  );
  const defaultPresets = applyPresetInstructionOverrides(
    baseDefaultPresets,
    presetInstructions,
  );
  const initialCustomCharacters: Preset[] = (userCharacters ?? []).map(
    (character) => mapCharacterToPreset(character as CharacterRow),
  );

  const { lang } = await params;

  const dict = await getDictionary(lang, 'call');

  return (
    // <PHProvider>
    <PlaygroundStateProvider
      defaultPresets={defaultPresets}
      initialCustomCharacters={initialCustomCharacters}
      initialState={{
        selectedPresetId: defaultPresets[0]?.id ?? null,
        instructions: defaultInstructions,
        initialInstruction,
        language: lang as CallLanguage,
      }}
    >
      <ConnectionProvider dict={dict}>
        <TooltipProvider>
          <RoomWrapper>{children}</RoomWrapper>
        </TooltipProvider>
      </ConnectionProvider>
    </PlaygroundStateProvider>
  );
}
