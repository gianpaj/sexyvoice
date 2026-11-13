import 'next-intl';

import type { Locale } from '@/lib/i18n/i18n-config';
import type messages from '@/messages/en.json';

type Messages = typeof messages;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface IntlMessages extends Messages {}
}

declare module 'next-intl' {
  interface AppConfig {
    Locale: Locale;
    Messages: Messages;
  }
}

declare module 'next-intl/navigation' {
  interface LocaleOverrides {
    locales: Locale;
  }
}
