import { getMessages } from 'next-intl/server';

import type { Locale } from '@/lib/i18n/i18n-config';
import { hasUserPaid } from '@/lib/supabase/queries';
import { createClient } from '@/lib/supabase/server';
import { ApiKeys } from './api-keys';

export default async function ApiKeysPage(props: {
  params: Promise<{ lang: Locale }>;
}) {
  const { lang } = await props.params;
  const dict = ((await getMessages({ locale: lang })) as IntlMessages).profile;

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const isPaidUser = data.user ? await hasUserPaid(data.user.id) : false;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <ApiKeys dict={dict.apiKeys} isPaidUser={!isPaidUser} />
    </div>
  );
}
