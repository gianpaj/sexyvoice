import { defineRouting } from 'next-intl/routing';

// The site's locales. `scripts/check-translations.mjs` imports this file with
// Node's type stripping, so it must not use path aliases.
export const routing = defineRouting({
  // Used when no locale matches
  defaultLocale: 'en',
  locales: ['en', 'es', 'de', 'da', 'it', 'fr'],
});
