import CreditsSection from '@/components/credits-section';
import { getDictionary } from '@/lib/i18n/get-dictionary';
import type { Locale } from '@/lib/i18n/i18n-config';
import { createClient } from '@/lib/supabase/server';
import { GenerateUI } from './generateui.client';

export default async function GeneratePage(props: {
  params: Promise<{ lang: Locale }>;
}) {
  const params = await props.params;
  const { lang } = params;
  const dict = await getDictionary(lang);

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

  const { data: credit_transactions } = await supabase
    .from('credit_transactions')
    .select('*')
    .eq('user_id', user.id)
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
          lang={lang}
          dict={dict.creditsSection}
          credits={credits.amount || 0}
          credit_transactions={credit_transactions || []}
          doNotToggleSidebar
        />
      </div>

      <div className="grid gap-6 pb-16">
        <GenerateUI
          dict={dict.generate}
          hasEnoughCredits={credits.amount >= 10}
          publicVoices={publicVoices}
          locale={lang}
        />
      </div>
    </div>
  );
}
