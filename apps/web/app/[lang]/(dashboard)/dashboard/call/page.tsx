import { getTranslations } from 'next-intl/server';

import { CallExperience } from '@/components/call/call-experience';
import { CallFaq } from '@/components/call/call-faq';
import CreditsSection from '@/components/credits-section';
import { getCallCloneProvider } from '@/lib/clone/call-clone-provider';
import { createDashboardMetadata } from '@/lib/dashboard-metadata';
import { getE2ECallUser } from '@/lib/e2e-call-user';
import {
  E2E_CALL_VOICES,
  E2E_CREDIT_TRANSACTIONS,
  E2E_SAVED_CALL_VOICES,
} from '@/lib/e2e-mocks';
import type { Locale } from '@/lib/i18n/i18n-config';
import { getVerifiedClaims } from '@/lib/supabase/auth';
import { getSavedCallVoices } from '@/lib/supabase/call-voices';
import { getCallVoices, hasUserPaid } from '@/lib/supabase/queries';
import { createClient } from '@/lib/supabase/server';

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
  const [{ data: creditTransactions }, isPaidUser, callVoices, savedVoices] =
    e2e
      ? [
          { data: E2E_CREDIT_TRANSACTIONS },
          e2e.isPaidUser,
          E2E_CALL_VOICES,
          e2e.isPaidUser ? E2E_SAVED_CALL_VOICES : [],
        ]
      : await Promise.all([
          supabase
            .from('credit_transactions')
            .select('amount')
            .eq('user_id', userId)
            .order('created_at', { ascending: false }),
          hasUserPaid(userId),
          getCallVoices(),
          getSavedCallVoices(userId),
        ]);

  return (
    <div data-e2e-call-fixtures={e2e ? '' : undefined}>
      <CallExperience
        callCloneProvider={getCallCloneProvider()}
        callVoices={callVoices}
        isPaidUser={isPaidUser}
        mobileCredits={
          <div className="lg:hidden" data-testid="call-mobile-credits">
            <CreditsSection
              creditTransactions={creditTransactions}
              doNotToggleSidebar
              lang={lang}
              showMinutes
              userId={userId}
            />
          </div>
        }
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
    </div>
  );
}
