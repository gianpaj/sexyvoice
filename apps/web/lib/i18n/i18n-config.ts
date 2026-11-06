import { routing } from '@/src/i18n/routing';

export type Locale = (typeof routing.locales)[number];

/** @deprecated The same object as `routing` from `@/src/i18n/routing`. */
export const i18n = routing;
