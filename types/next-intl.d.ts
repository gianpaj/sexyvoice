import 'next-intl';
import type { i18n } from '@/lib/i18n/i18n-config';
import type messages from '@/messages/en.json';

type Messages = typeof messages;
type AppLocales = (typeof i18n)['locales'][number];

declare global {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface IntlMessages extends Messages {}
}

declare module 'next-intl' {
}

declare module 'next-intl/navigation' {
  interface LocaleOverrides {
    locales: AppLocales;
  }
}
