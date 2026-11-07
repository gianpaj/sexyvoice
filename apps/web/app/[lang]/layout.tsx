import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { notFound } from 'next/navigation';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import {
  getMessages,
  getTranslations,
  setRequestLocale,
} from 'next-intl/server';

import { Toaster } from '@/components/ui/sonner';
import type { Locale } from '@/lib/i18n/i18n-config';
import { siteMetadata } from '@/lib/page-metadata';
import { routing } from '@/src/i18n/routing';
import '../globals.css';

const inter = Inter({ subsets: ['latin'] });

/** How long a toast stays up unless it sets its own duration. */
const TOAST_DURATION_MS = 6000;

interface Props {
  children: React.ReactNode;
  params: Promise<{ lang: Locale }>;
}

export async function generateStaticParams() {
  return routing.locales.map((lang) => ({ lang }));
}

export async function generateMetadata({
  params,
}: Pick<Props, 'params'>): Promise<Metadata> {
  const { lang } = await params;
  const t = await getTranslations({ locale: lang, namespace: 'pages' });
  return siteMetadata({
    description: t('description'),
    title: t('defaultTitle'),
  });
}

export default async function LangLayout({
  children,
  params,
}: Readonly<Props>) {
  // Ensure that the incoming `lang` is valid
  const { lang } = await params;
  if (!hasLocale(routing.locales, lang)) {
    notFound();
  }

  // Enable static rendering
  setRequestLocale(lang);

  const messages = (await getMessages({ locale: lang })) as IntlMessages;

  return (
    <html lang={lang}>
      <head>
        {/* The site is dark-only; tell the Dark Reader extension to stay off */}
        <meta name="darkreader-lock" />
      </head>
      <body className={`${inter.className} dark`} suppressHydrationWarning>
        <a className="sr-only focus:not-sr-only" href="#main-content">
          {messages.pages.skipToMainContent}
        </a>
        {process.env.NODE_ENV === 'production' && (
          <>
            <Analytics debug={false} />
            <SpeedInsights debug={false} />
          </>
        )}
        <NextIntlClientProvider locale={lang} messages={messages}>
          {children}
          <Toaster duration={TOAST_DURATION_MS} />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
