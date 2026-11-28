import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';

import { CallExperience } from '@/components/call/call-experience';
import { CallFaq } from '@/components/call/call-faq';
import { LiveKitVoiceChat } from '@/components/call/livekit-voice-chat';
import { RoomWrapper } from '@/components/call/room-wrapper';
import CreditsSection from '@/components/credits-section';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { CallLanguage } from '@/data/playground-state';
import { ConnectionProvider } from '@/hooks/use-connection';
import { PlaygroundStateProvider } from '@/hooks/use-playground-state';
import { type CharacterRow, mapCharacterToPreset } from '@/lib/call-presets';
import { getCallCloneProvider } from '@/lib/clone/call-clone-provider';
import { createDashboardMetadata } from '@/lib/dashboard-metadata';
import { getE2ECallUser } from '@/lib/e2e-call-user';
import {
  E2E_CALL_INSTRUCTION_CONFIG,
  E2E_CALL_VOICES,
  E2E_CREDIT_TRANSACTIONS,
  E2E_PUBLIC_CALL_CHARACTERS,
  E2E_SAVED_CALL_VOICES,
} from '@/lib/e2e-mocks';
import {
  applyPresetInstructionOverrides,
  getCallInstructionConfig,
} from '@/lib/edge-config/call-instructions';
import type { Locale } from '@/lib/i18n/i18n-config';
import { getVerifiedClaims } from '@/lib/supabase/auth';
import { getSavedCallVoices } from '@/lib/supabase/call-voices';
import {
  getCallVoices,
  getCreditTransactionAmounts,
  getPublicCallCharacters,
  getUserCallCharacters,
  hasUserPaid,
} from '@/lib/supabase/queries';
import { createClient } from '@/lib/supabase/server';
import { canUseCallChat } from '@/lib/voice-chat/access';
import { getCharacterVoiceReferenceId } from '@/lib/voice-chat/characters';
import { openCallConversation } from './actions';

export const generateMetadata = createDashboardMetadata('/dashboard/call');

export default async function Call(props: {
  params: Promise<{ lang: Locale }>;
  searchParams: Promise<{
    conversation?: string | string[];
    custom?: string | string[];
    voice?: string | string[];
  }>;
}) {
  const { lang } = await props.params;
  const { conversation, custom, voice } = await props.searchParams;
  const returnFromClone =
    custom === '1'
      ? { voiceId: typeof voice === 'string' ? voice : null }
      : null;

  const [t, tProfile] = await Promise.all([
    getTranslations({ locale: lang, namespace: 'call' }),
    getTranslations({ locale: lang, namespace: 'profile' }),
  ]);

  const supabase = await createClient();

  const claims = await getVerifiedClaims(supabase);
  const userId = claims?.sub;
  if (!userId) {
    return <div>{tProfile('notLoggedIn')}</div>;
  }

  const e2e = await getE2ECallUser();
  const [
    creditTransactions,
    isPaidUser,
    callVoices,
    savedVoices,
    { defaultInstructions, initialInstruction, presetInstructions },
    publicCharacters,
  ] = e2e
    ? [
        E2E_CREDIT_TRANSACTIONS,
        e2e.isPaidUser,
        E2E_CALL_VOICES,
        e2e.isPaidUser ? E2E_SAVED_CALL_VOICES : [],
        E2E_CALL_INSTRUCTION_CONFIG,
        E2E_PUBLIC_CALL_CHARACTERS,
      ]
    : await Promise.all([
        getCreditTransactionAmounts(userId),
        hasUserPaid(userId),
        getCallVoices(),
        getSavedCallVoices(userId),
        getCallInstructionConfig(),
        getPublicCallCharacters(),
      ]);
  const userCharacters =
    !e2e && isPaidUser ? await getUserCallCharacters(userId) : [];

  const defaultPresets = applyPresetInstructionOverrides(
    (publicCharacters ?? []).map((character) =>
      mapCharacterToPreset(character as CharacterRow),
    ),
    presetInstructions,
  );
  const initialCustomCharacters = (userCharacters ?? []).map((character) =>
    mapCharacterToPreset(character as CharacterRow),
  );

  const chatEnabled = isPaidUser && canUseCallChat(userId);
  const inworldVoiceIds = new Set(
    savedVoices
      .filter(({ provider }) => provider === 'inworld')
      .map(({ id }) => id),
  );
  const chatCharacterIds = chatEnabled
    ? initialCustomCharacters.flatMap(({ id, sessionConfig, instructions }) => {
        const voiceId = getCharacterVoiceReferenceId(sessionConfig);
        return voiceId && inworldVoiceIds.has(voiceId) && instructions.trim()
          ? [id]
          : [];
      })
    : [];
  if (conversation !== undefined && chatEnabled) {
    const thread = z.uuid().safeParse(conversation);
    if (!thread.success) notFound();
    const { data, error } = await supabase
      .from('conversations')
      .select('character_id,language,scene_instructions')
      .eq('id', thread.data)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw new Error('Could not load conversation');
    const preset = initialCustomCharacters.find(
      ({ id }) => id === data?.character_id,
    );
    if (!(data && preset && chatCharacterIds.includes(preset.id))) notFound();
    return (
      <LiveKitVoiceChat
        characterName={preset.name}
        chatThreadId={thread.data}
        conversationId={thread.data}
        key={thread.data}
        pythonCall={{
          preset,
          language: data.language,
          openConversation: openCallConversation.bind(null, {
            characterId: preset.id,
            language: data.language,
            scene: data.scene_instructions,
          }),
        }}
      />
    );
  }

  return (
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
          <RoomWrapper>
            <CallExperience
              callCloneProvider={getCallCloneProvider()}
              callVoices={callVoices}
              e2eFixtures={Boolean(e2e)}
              isPaidUser={isPaidUser}
              mobileCredits={
                <div className="lg:hidden" data-testid="call-mobile-credits">
                  <CreditsSection
                    creditTransactions={creditTransactions}
                    doNotToggleSidebar
                    showMinutes
                    userId={userId}
                  />
                </div>
              }
              openConversation={chatEnabled ? openCallConversation : undefined}
              returnFromClone={returnFromClone}
              savedVoices={savedVoices}
            >
              <div className="flex flex-col gap-5">
                <p
                  className="text-center text-foreground text-xs leading-7"
                  data-testid="call-notice-text"
                >
                  {t('notice1')}
                  <br />
                  {t('notice2')}
                </p>
                <CallFaq />
              </div>
            </CallExperience>
          </RoomWrapper>
        </TooltipProvider>
      </ConnectionProvider>
    </PlaygroundStateProvider>
  );
}
