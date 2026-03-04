import { getDictionary } from '@/lib/i18n/get-dictionary';
import type { Locale } from '@/lib/i18n/i18n-config';
import { ApiKeys } from '../profile/api-keys';

export default async function ApiKeysPage(props: {
  params: Promise<{ lang: Locale }>;
}) {
  const { lang } = await props.params;
  const dict = await getDictionary(lang, 'profile');

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <ApiKeys dict={dict.apiKeys} />
    </div>
  );
}
