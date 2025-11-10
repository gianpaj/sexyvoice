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

  const dict = await getDictionary(lang, 'clone');

  return (
    <NewVoiceClient
      dict={dict}
      lang={lang}
      hasEnoughCredits={credits.amount >= 10}
    />
  );
}
