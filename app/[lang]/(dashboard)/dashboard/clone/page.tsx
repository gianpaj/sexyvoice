import { getDictionary } from '@/lib/i18n/get-dictionary';
import { createClient } from '@/lib/supabase/server';
import NewVoiceClient from './new.client';
import { Locale } from '@/lib/i18n/i18n-config';

export default async function NewVoicePage(props: {
  params: Promise<{ lang: Locale }>;
}) {
  const supabase = await createClient();
  const { lang } = await props.params;

  const { data } = await supabase.auth.getUser();
  const user = data?.user;
  if (!user) {
    return <div>Not logged in</div>;
  }

  const dict = await getDictionary(lang, 'generate');
  return <NewVoiceClient dict={dict} />;
}
