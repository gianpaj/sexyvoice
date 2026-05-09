import { defineRouting } from 'next-intl/routing';

import { i18n } from '@/lib/i18n/i18n-config';

export const routing = defineRouting({
  // A list of all locales that are supported
  locales: i18n.locales,

  // Used when no locale matches
  defaultLocale: i18n.defaultLocale,
});
