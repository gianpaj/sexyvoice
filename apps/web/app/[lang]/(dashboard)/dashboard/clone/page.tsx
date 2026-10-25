import { Mic2 } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { CreditBalanceError } from '@/components/credit-balance-error';
import CreditsSection from '@/components/credits-section';
import { getDemoCloneSelection } from '@/data/demo-clone';
import { getCallCloneProvider } from '@/lib/clone/call-clone-provider';
import { createDashboardMetadata } from '@/lib/dashboard-metadata';
import type { Locale } from '@/lib/i18n/i18n-config';
import { getVerifiedClaims } from '@/lib/supabase/auth';
import { getSavedCallVoices } from '@/lib/supabase/call-voices';
import { getDashboardCreditBalance } from '@/lib/supabase/dashboard-credit-balance';
import { hasUserPaid } from '@/lib/supabase/queries';
import { createClient } from '@/lib/supabase/server';
import NewVoiceClient from './new.client';

export const generateMetadata = createDashboardMetadata('/dashboard/clone');

export default async function NewVoicePage(props: {
  params: Promise<{ lang: Locale }>;
  searchParams?: Promise<{
    for?: string | string[];
    demo?: string | string[];
    take?: string | string[];
  }>;
}) {
  const [{ lang }, searchParams] = await Promise.all([
    props.params,
    props.searchParams ??
      Promise.resolve({ for: undefined, demo: undefined, take: undefined }),
  ]);
  const selection = getDemoCloneSelection(
    typeof searchParams.demo === 'string' ? searchParams.demo : null,
    typeof searchParams.take === 'string' ? searchParams.take : null,
  );
  const supabase = await createClient();
  const [t, tProfile] = await Promise.all([
    getTranslations('clone'),
    getTranslations('profile'),
  ]);
  const claims = await getVerifiedClaims(supabase);
  const userId = claims?.sub;

  if (!userId) {
    return <div>{tProfile('notLoggedIn')}</div>;
  }

  const [
    creditBalance,
    { data: creditTransactions },
    userHasPaid,
    savedVoices,
  ] = await Promise.all([
    getDashboardCreditBalance(supabase, userId, 'dashboard/clone'),
    supabase
      .from('credit_transactions')
      .select('amount')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
    hasUserPaid(userId),
    getSavedCallVoices(userId),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h2 className="flex items-center gap-2 font-bold text-3xl tracking-tight">
          <Mic2 size={26} /> {t('title')}
        </h2>
        <p className="text-muted-foreground">{t('subtitle')}</p>
      </div>
      <div className="mb-6 lg:hidden">
        <CreditsSection
          creditTransactions={creditTransactions}
          doNotToggleSidebar
          lang={lang}
          userId={userId}
        />
      </div>
      {creditBalance === null ? (
        <CreditBalanceError />
      ) : (
        <NewVoiceClient
          callCloneProvider={getCallCloneProvider()}
          hasEnoughCredits={creditBalance >= 10}
          initialDemo={
            selection
              ? { speakerId: selection.speaker.id, takeId: selection.take.id }
              : undefined
          }
          initialSaveForCalls={searchParams.for === 'call'}
          lang={lang}
          savedVoices={savedVoices ?? []}
          userHasPaid={userHasPaid}
        />
      )}
    </div>
  );
}
