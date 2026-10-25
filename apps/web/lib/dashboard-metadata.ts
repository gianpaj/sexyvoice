import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import type { Locale } from '@/lib/i18n/i18n-config';

type DashboardPath = Extract<
  keyof IntlMessages['pages'],
  `/dashboard/${string}`
>;

export function createDashboardMetadata(path: DashboardPath) {
  return async function generateMetadata({
    params,
  }: {
    params: Promise<{ lang: Locale }>;
  }): Promise<Metadata> {
    const { lang } = await params;
    const t = await getTranslations({ locale: lang, namespace: 'pages' });

    return { title: t(path) };
  };
}
