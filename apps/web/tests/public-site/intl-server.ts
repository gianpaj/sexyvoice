import { createTranslator } from 'next-intl';

import type { Locale } from '@/lib/i18n/i18n-config';
import da from '@/messages/da.json';
import de from '@/messages/de.json';
import en from '@/messages/en.json';
import es from '@/messages/es.json';
import fr from '@/messages/fr.json';
import it from '@/messages/it.json';

// A `next-intl/server` stand-in that serves the real message files, so pages
// render the copy and metadata they produce in production.

export const messagesByLocale: Record<Locale, IntlMessages> = {
  da,
  de,
  en,
  es,
  fr,
  it,
};

export async function getMessages({ locale }: { locale: Locale }) {
  return messagesByLocale[locale];
}

export async function getTranslations({
  locale,
  namespace,
}: {
  locale: Locale;
  namespace?: string;
}) {
  return createTranslator({
    locale,
    messages: messagesByLocale[locale],
    namespace: namespace as never,
  });
}

export function setRequestLocale(_locale: Locale) {}
