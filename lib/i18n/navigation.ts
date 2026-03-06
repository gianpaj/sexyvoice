import { createNavigation } from 'next-intl/navigation';

import { i18n } from './i18n-config';

export const { Link, redirect, usePathname, useRouter } = createNavigation({
  locales: i18n.locales,
  localePrefix: i18n.localePrefix,
});
