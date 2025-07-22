import { getDictionary } from '@/lib/i18n/get-dictionary';
import { createClient } from '@/lib/supabase/server';
import NewVoiceClient from './new.client';

export default async function NewVoicePage(props: {
  params: Promise<{ lang: string }>;
}) {
  const supabase = await createClient();
  const { lang } = await props.params;

  const { data } = await supabase.auth.getUser();
  const user = data?.user;
  if (!user) {
    return <div>Not logged in</div>;
  }

  const dict = await getDictionary(lang as 'en' | 'es', 'generate');
  return <NewVoiceClient dict={dict} />;
}
