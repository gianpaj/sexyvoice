import { PhoneCall } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { CallFaq } from '@/components/call/call-faq';
import { Chat } from '@/components/call/chat';
import { ConfigurationForm } from '@/components/call/configuration-form';
import { RoomWrapper } from '@/components/call/room-wrapper';
import CreditsSection from '@/components/credits-section';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { CallLanguage } from '@/data/playground-state';
import { ConnectionProvider } from '@/hooks/use-connection';
import { PlaygroundStateProvider } from '@/hooks/use-playground-state';
import { type CharacterRow, mapCharacterToPreset } from '@/lib/call-presets';
import { createDashboardMetadata } from '@/lib/dashboard-metadata';
import { getE2ECallUser } from '@/lib/e2e-call-user';
import {
  E2E_CALL_INSTRUCTION_CONFIG,
  E2E_CALL_VOICES,
  E2E_CREDIT_TRANSACTIONS,
  E2E_PUBLIC_CALL_CHARACTERS,
} from '@/lib/e2e-mocks';
import {
  applyPresetInstructionOverrides,
  getCallInstructionConfig,
} from '@/lib/edge-config/call-instructions';
import type { Locale } from '@/lib/i18n/i18n-config';
import { getVerifiedClaims } from '@/lib/supabase/auth';
import {
  getCallVoices,
  getCreditTransactionAmounts,
  getPublicCallCharacters,
  getUserCallCharacters,
  hasUserPaid,
} from '@/lib/supabase/queries';
import { createClient } from '@/lib/supabase/server';

// import { PresetShare } from "@/components/preset-share";

export const generateMetadata = createDashboardMetadata('/dashboard/call');

export default async function Call(props: {
  params: Promise<{ lang: Locale }>;
}) {
  const { lang } = await props.params;

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
    { defaultInstructions, initialInstruction, presetInstructions },
    publicCharacters,
  ] = e2e
    ? [
        E2E_CREDIT_TRANSACTIONS,
        e2e.isPaidUser,
        E2E_CALL_VOICES,
        E2E_CALL_INSTRUCTION_CONFIG,
        E2E_PUBLIC_CALL_CHARACTERS,
      ]
    : await Promise.all([
        getCreditTransactionAmounts(userId),
        hasUserPaid(userId),
        getCallVoices(),
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
            <div
              className="mx-auto flex w-full flex-col md:max-w-3xl"
              data-e2e-call-fixtures={e2e ? '' : undefined}
            >
              <div>
                <h2 className="flex items-center gap-2 font-bold text-3xl tracking-tight">
                  <PhoneCall size={26} /> {t('title')}
                </h2>
                <p className="text-muted-foreground">{t('subtitle')}</p>
              </div>
              <div className="lg:hidden">
                <CreditsSection
                  creditTransactions={creditTransactions}
                  doNotToggleSidebar
                  lang={lang}
                  showMinutes
                  userId={userId}
                />
              </div>
              <div className="my-6 flex w-full px-0 md:px-4">
                <ConfigurationForm
                  callVoices={callVoices}
                  isPaidUser={isPaidUser}
                  lang={lang}
                />
              </div>
              <main className="flex w-full flex-1 flex-col md:p-4 lg:mt-16">
                <div className="mx-auto flex h-full w-full flex-col justify-center gap-5 bg-bg1">
                  <Chat />
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
              </main>
            </div>
          </RoomWrapper>
        </TooltipProvider>
      </ConnectionProvider>
    </PlaygroundStateProvider>
  );
}
