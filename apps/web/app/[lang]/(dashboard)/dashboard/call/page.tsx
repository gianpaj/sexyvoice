import { PhoneCall } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { CallFaq } from '@/components/call/call-faq';
import { Chat } from '@/components/call/chat';
import { ConfigurationForm } from '@/components/call/configuration-form';
import CreditsSection from '@/components/credits-section';
import {
  E2E_CALL_VOICES,
  E2E_CREDIT_TRANSACTIONS,
  isE2E,
} from '@/lib/e2e-mocks';
import type { Locale } from '@/lib/i18n/i18n-config';
import { getVerifiedClaims } from '@/lib/supabase/auth';
import { getCallVoices, hasUserPaid } from '@/lib/supabase/queries';
import { createClient } from '@/lib/supabase/server';
// import { PresetShare } from "@/components/preset-share";

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

  const [{ data: creditTransactions }, isPaidUser, callVoices] = isE2E()
    ? [{ data: E2E_CREDIT_TRANSACTIONS }, false, E2E_CALL_VOICES]
    : await Promise.all([
        supabase
          .from('credit_transactions')
          .select('amount')
          .eq('user_id', userId)
          .order('created_at', { ascending: false }),
        hasUserPaid(userId),
        getCallVoices(),
      ]);

  return (
    <div className="mx-auto flex w-full flex-col md:max-w-3xl">
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
  );
}
