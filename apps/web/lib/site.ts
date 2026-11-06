import type { Locale } from '@/lib/i18n/i18n-config';

/**
 * Origin of the web app. Canonical URLs, the sitemap, structured data and
 * agent markdown all link to it.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || 'https://sexyvoice.ai'
).replace(/\/$/, '');

export const SITE_NAME = 'SexyVoice.ai';

/** Public origin of the R2 bucket that serves sample and demo audio. */
export const FILES_URL = 'https://files.sexyvoice.ai';

/**
 * The absolute URL of a page in one locale. `path` is the part after the
 * locale prefix: `/` for the landing page, `/blog` for the blog index.
 */
export function localeUrl(lang: Locale, path: string): string {
  return `${SITE_URL}/${lang}${path === '/' ? '' : path}`;
}
