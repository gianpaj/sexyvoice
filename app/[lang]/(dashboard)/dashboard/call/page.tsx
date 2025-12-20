import { Chat } from '@/components/call/chat';
import { ConfigurationForm } from '@/components/call/configuration-form';
import CreditsSection from '@/components/credits-section';
import { getDictionary } from '@/lib/i18n/get-dictionary';
import type { Locale } from '@/lib/i18n/i18n-config';
import { createClient } from '@/lib/supabase/server';
// import { PresetShare } from "@/components/preset-share";

export default async function Call(props: {
  params: Promise<{ lang: Locale }>;
}) {
  const { lang } = await props.params;

  const dict = await getDictionary(lang);

  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (!user || error) {
    return <div>Not logged in</div>;
  }

  const { data: creditTransactions } = await supabase
    .from('credit_transactions')
    .select('amount')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  return (
    <div className="mx-auto flex w-full flex-col md:max-w-3xl">
      <CreditsSection
        creditTransactions={creditTransactions}
        dict={dict.creditsSection}
        doNotToggleSidebar
        lang={lang}
        showMinutes
        userId={user.id}
      />
      <div className="my-6 flex w-full px-0 md:px-4">
        <ConfigurationForm />
      </div>
      <main className="flex w-full flex-1 flex-col md:p-4 lg:mt-16">
        <div className="mx-auto flex h-full w-full flex-col justify-center gap-5 bg-bg1">
          <Chat />
          <p className="text-center text-foreground text-xs">
            {dict.call.notice1}
            <br />
            {dict.call.notice2}
          </p>
        </div>
      </main>
    </div>
  );
}
