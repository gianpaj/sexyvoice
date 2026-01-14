import { getMessages } from 'next-intl/server';
import { redirect } from 'next/navigation';

import CreditsSection from '@/components/credits-section';
import type { Locale } from '@/lib/i18n/i18n-config';
import { createClient } from '@/lib/supabase/server';
import { GenerateUI } from './generateui.client';

export default async function GeneratePage(props: {
  params: { lang: Locale };
}) {
  const { lang } = props.params;
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
  const ensuredUserId = userId ?? '';

  // Get user's credits
  const { data: creditsData } = (await supabase
    .from('credits')
    .select('amount')
    .eq('user_id', ensuredUserId)
    .single()) || { amount: 0 };

  const credits = creditsData || { amount: 0 };

  const { data: credit_transactions } = await supabase
    .from('credit_transactions')
    .select('*')
    .eq('user_id', ensuredUserId)
    .order('created_at', { ascending: false });

  // Get user's voices
  // const { data: userVoices } = await supabase
  //   .from('voices')
  //   .select('*')
  //   .eq('user_id', user?.id);

  // Get public voices
  const { data: publicVoices } = await supabase
    .from('voices')
    .select('*')
    .eq('is_public', true);

  if (!publicVoices) {
    return <div>No public voices found</div>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-bold text-3xl tracking-tight">
          {dict.generate.title}
        </h2>
        <p className="text-muted-foreground">{dict.generate.subtitle}</p>
      </div>

      <div className="lg:hidden">
        <CreditsSection
          credit_transactions={credit_transactions || []}
          credits={credits.amount || 0}
          doNotToggleSidebar
        />
      </div>

      <div className="grid gap-6 pb-16">
        <GenerateUI
          dict={dict.generate}
          hasEnoughCredits={credits.amount >= 1}
          locale={lang}
          publicVoices={publicVoices}
        />
      </div>
    </div>
  );
}
