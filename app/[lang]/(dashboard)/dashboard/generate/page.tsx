import { getMessages } from 'next-intl/server';
import { redirect } from 'next/navigation';

import CreditsSection from '@/components/credits-section';
import type { Locale } from '@/lib/i18n/i18n-config';
import { hasUserPaid } from '@/lib/supabase/queries';
import { createClient } from '@/lib/supabase/server';
import { GenerateUI } from './generateui.client';

export default async function GeneratePage(props: {
  params: Promise<{ lang: Locale }>;
}) {
  const { lang } = await props.params;
  const dict = (await getMessages({ locale: lang })) as IntlMessages;
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  const userId = user?.id;
  if (!userId || error) {
    redirect(`/${lang}/login`);
  }

  const { data: creditsData } = (await supabase
    .from('credits')
    .select('amount')
    .eq('user_id', userId)
    .single()) || { amount: 0 };
  const credits = creditsData || { amount: 0 };

  const [{ data: creditTransactions }, isPaidUser, { data: publicVoices }] =
    await Promise.all([
      supabase
        .from('credit_transactions')
        .select('amount')
        .eq('user_id', userId)
        .order('created_at', { ascending: false }),
      hasUserPaid(userId),
      supabase.from('voices').select('*').eq('feature', 'tts').eq('is_public', true),
    ]);

  if (!publicVoices) {
    return <div>No public voices found</div>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h2 className="font-bold text-3xl tracking-tight">
          {dict.generate.title}
        </h2>
        <p className="text-muted-foreground">{dict.generate.subtitle}</p>
      </div>

      <div className="lg:hidden">
        <CreditsSection
          creditTransactions={creditTransactions || []}
          doNotToggleSidebar
          lang={lang}
          userId={userId}
        />
      </div>

      <div className="grid gap-6 pb-16">
        <GenerateUI
          dict={dict.generate}
          hasEnoughCredits={credits.amount >= 10}
          isPaidUser={isPaidUser}
          locale={lang}
          publicVoices={publicVoices}
        />
      </div>
    </div>
  );
}
