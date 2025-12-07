import CreditsSection from '@/components/credits-section';
import { getDictionary } from '@/lib/i18n/get-dictionary';
import type { Locale } from '@/lib/i18n/i18n-config';
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

  // Get user's credits
  const { data: creditsData } = (await supabase
    .from('credits')
    .select('amount')
    .eq('user_id', user.id)
    .single()) || { amount: 0 };

  const credits = creditsData || { amount: 0 };

  const { data: creditTransactions } = await supabase
    .from('credit_transactions')
    .select('amount')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  const dict = await getDictionary(lang);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 lg:hidden">
        <CreditsSection
          creditTransactions={creditTransactions}
          dict={dict.creditsSection}
          doNotToggleSidebar
          lang={lang}
          userId={user.id}
        />
      </div>
      <NewVoiceClient
        dict={dict.clone}
        hasEnoughCredits={credits.amount >= 10}
        lang={lang}
      />
    </div>
  );
}
