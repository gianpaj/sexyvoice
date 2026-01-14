import { getMessages } from 'next-intl/server';

import type { Locale } from '@/lib/i18n/i18n-config';
import DashboardUI from './dashboard.ui';

export default async function DashboardLayout(props: {
  children: React.ReactNode;
  params: { lang: Locale };
}) {
  const { lang } = props.params;

  const messages = (await getMessages({ locale: lang })) as IntlMessages;
  const blackFridayDict = messages.promos.blackFridayBanner;

  return (
    <DashboardUI
      blackFridayDict={blackFridayDict}
      lang={lang}
    >
      {props.children}
    </DashboardUI>
  );
}
