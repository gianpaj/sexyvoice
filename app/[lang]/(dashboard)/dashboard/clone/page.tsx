import { getMessages } from 'next-intl/server';

import type { Locale } from '@/lib/i18n/i18n-config';
import { createClient } from '@/lib/supabase/server';
import NewVoiceClient from './new.client';

export default async function NewVoicePage(_props: {
  params: { lang: Locale };
}) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data?.user;
  if (!user) {
    return <div>Not logged in</div>;
  }

  const dict = (await getMessages()) as IntlMessages;
  return <NewVoiceClient dict={dict.generate} />;
}
