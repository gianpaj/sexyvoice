import { getMessages } from 'next-intl/server';

import CreditsSection from '@/components/credits-section';
import type { Locale } from '@/lib/i18n/i18n-config';
import { hasUserPaid } from '@/lib/supabase/queries';
import { createClient } from '@/lib/supabase/server';
import NewVoiceClient from './new.client';

export default async function NewVoicePage(props: {
  params: Promise<{ lang: Locale }>;
}) {
  const { lang } = await props.params;
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (!user || error) {
    return <div>Not logged in</div>;
  }

  const [
    { data: creditsData },
    { data: creditTransactions },
    isPaidUser,
    messages,
  ] = await Promise.all([
    supabase
      .from('credits')
      .select('amount')
      .eq('user_id', user.id)
      .single()
      .then((res) => res ?? { data: { amount: 0 } }),
    supabase
      .from('credit_transactions')
      .select('amount')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
    hasUserPaid(user.id),
    getMessages({ locale: lang }),
  ]);

  const dict = messages as IntlMessages;
  const credits = creditsData || { amount: 0 };

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 lg:hidden">
        <CreditsSection
          creditTransactions={creditTransactions}
          doNotToggleSidebar
          lang={lang}
          userId={user.id}
        />
      </div>
      <NewVoiceClient
        dict={dict.clone}
        hasEnoughCredits={credits.amount >= 10}
        isPaidUser={isPaidUser}
        lang={lang}
      />
    </div>
  );
}
