import { NextIntlClientProvider } from 'next-intl';
import type { Metadata, ResolvingMetadata } from 'next';
import { Inter } from 'next/font/google';
import { getMessages } from 'next-intl/server';

import { i18n, type Locale } from '@/lib/i18n/i18n-config';
import { Providers } from '../providers';

const inter = Inter({ subsets: ['latin'] });

export async function generateStaticParams() {
  return i18n.locales.map((locale) => ({ lang: locale }));
}

export async function generateMetadata(
  { params }: { params: { lang: Locale } },
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const lang = params.lang;

  const { alternates, openGraph, title: parentTitle } = await parent;

  const canonicalUrl = alternates?.canonical?.url;
  const pathname = canonicalUrl ? new URL(canonicalUrl).pathname : '/';
  const pagePath = pathname.replace(`/${lang}`, '') || '/';

  // Validate that the language is a supported locale
  if (!i18n.locales.includes(lang as Locale)) {
    return {
      title: 'SexyVoice.ai - Free Text to Speech & AI Voice Generator',
    };
  }

  const messages = (await getMessages({ locale: lang })) as IntlMessages;
  const pageTitle =
    pagePath in messages.pages
      ? messages.pages[pagePath as keyof typeof messages.pages]
      : undefined;
  const title = pageTitle || messages.pages.defaultTitle;

  return {
    title: {
      template: parentTitle?.template || '',
      default: title,
    },
    description: messages.pages.description,
    openGraph: {
      title,
      description: messages.pages.description,
      ...(openGraph?.url ? { url: openGraph.url } : {}),
      ...(openGraph?.images ? { images: openGraph.images } : {}),
      ...(openGraph?.siteName ? { siteName: openGraph.siteName } : {}),
    },
  };
}

export default async function LangLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: { lang: Locale };
}>) {
  const { lang } = params;
  const messages = await getMessages({ locale: lang });

  return (
    <html lang={lang}>
      <body className={`${inter.className} dark`} suppressHydrationWarning>
        <a className="sr-only focus:not-sr-only" href="#main-content">
          Skip to main content
        </a>
        <NextIntlClientProvider locale={lang} messages={messages}>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
