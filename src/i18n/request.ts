import { getRequestConfig } from 'next-intl/server';

import { i18n } from '@/lib/i18n/i18n-config';

export default getRequestConfig(async ({ requestLocale }) => {
  const resolvedLocale = await requestLocale;
  const locale =
    resolvedLocale && i18n.locales.includes(resolvedLocale as (typeof i18n)['locales'][number])
      ? resolvedLocale
      : i18n.defaultLocale;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
