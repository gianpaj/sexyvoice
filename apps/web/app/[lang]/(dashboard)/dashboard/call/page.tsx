import { getTranslations } from 'next-intl/server';

import { CallExperience } from '@/components/call/call-experience';
import { CallFaq } from '@/components/call/call-faq';
import { RoomWrapper } from '@/components/call/room-wrapper';
import CreditsSection from '@/components/credits-section';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ConnectionProvider } from '@/hooks/use-connection';
import { PlaygroundStateProvider } from '@/hooks/use-playground-state';
import { toCharacter } from '@/lib/calls/characters';
import { toCallLanguage } from '@/lib/calls/languages';
import { getCallCloneProvider } from '@/lib/clone/call-clone-provider';
import { createDashboardMetadata } from '@/lib/dashboard-metadata';
import { getE2ECallUser } from '@/lib/e2e-call-user';
import {
  E2E_CALL_VOICES,
  E2E_CREDIT_TRANSACTIONS,
  E2E_PUBLIC_CALL_CHARACTERS,
  E2E_SAVED_CALL_VOICES,
} from '@/lib/e2e-mocks';
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

export const generateMetadata = createDashboardMetadata('/dashboard/call');

export default async function Call(props: {
  params: Promise<{ lang: Locale }>;
  searchParams: Promise<{
    custom?: string | string[];
    voice?: string | string[];
  }>;
}) {
  const { lang } = await props.params;
  const { custom, voice } = await props.searchParams;
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
    publicCharacters,
  ] = e2e
    ? [
        E2E_CREDIT_TRANSACTIONS,
        e2e.isPaidUser,
        E2E_CALL_VOICES,
        e2e.isPaidUser ? E2E_SAVED_CALL_VOICES : [],
        E2E_PUBLIC_CALL_CHARACTERS,
      ]
    : await Promise.all([
        getCreditTransactionAmounts(userId),
        hasUserPaid(userId),
        getCallVoices(),
        getSavedCallVoices(userId),
        getPublicCallCharacters(),
      ]);
  const userCharacters =
    !e2e && isPaidUser ? await getUserCallCharacters(userId) : [];

  const defaultPresets = publicCharacters.map(toCharacter);
  const initialCustomCharacters = userCharacters.map(toCharacter);

  return (
    <PlaygroundStateProvider
      defaultPresets={defaultPresets}
      initialCustomCharacters={initialCustomCharacters}
      initialState={{
        language: toCallLanguage(lang),
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
