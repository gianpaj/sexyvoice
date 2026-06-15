import { Mic2 } from 'lucide-react';
import { getMessages } from 'next-intl/server';

import CreditsSection from '@/components/credits-section';
import type { Locale } from '@/lib/i18n/i18n-config';
import { hasUserPaid } from '@/lib/supabase/queries';
import { createClient } from '@/lib/supabase/server';
import NewVoiceClient from './new.client';

export default async function NewVoicePage(props: {
  params: Promise<{ lang: Locale }>;
}) {
  const [{ lang }, supabase] = await Promise.all([
    props.params,
    createClient(),
  ]);
  const [
    {
      data: { user },
      error,
    },
    dict,
  ] = await Promise.all([
    supabase.auth.getUser(),
    getMessages({ locale: lang }),
  ]);

  if (!user || error) {
    return <div>Not logged in</div>;
  }

  const [{ data: creditsData }, { data: creditTransactions }, userHasPaid] =
    await Promise.all([
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
    ]);

  const credits = creditsData || { amount: 0 };

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h2 className="flex items-center gap-2 font-bold text-3xl tracking-tight">
          <Mic2 size={26} /> {dict.clone.title}
        </h2>
        <p className="text-muted-foreground">{dict.clone.subtitle}</p>
      </div>
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
        lang={lang}
        userHasPaid={userHasPaid}
      />
    </div>
  );
}
