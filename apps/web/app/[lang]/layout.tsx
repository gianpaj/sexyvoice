import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import type { Metadata, ResolvingMetadata } from 'next';
import { Inter } from 'next/font/google';
import { notFound } from 'next/navigation';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';

import { Providers } from '@/app/providers';
import type { Locale } from '@/lib/i18n/i18n-config';
import { routing } from '@/src/i18n/routing';
import '../globals.css';

const inter = Inter({ subsets: ['latin'] });

interface Props {
  children: React.ReactNode;
  params: Promise<{ lang: Locale }>;
}

export async function generateStaticParams() {
  return routing.locales.map((lang) => ({ lang }));
}

export async function generateMetadata(
  { params }: Pick<Props, 'params'>,
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const { lang } = await params;
  const { alternates, openGraph, title: parentTitle } = await parent;

  const pathname = alternates?.canonical?.url
    ? new URL(alternates.canonical.url).pathname
    : '/';
  const pagePath = pathname.replace(`/${lang}`, '') || '/';

  if (!routing.locales.includes(lang)) {
    return {
      title: 'SexyVoice.ai – Free AI Text-to-Speech & Voice Generator',
    };
  }

  const messages = (await getMessages({ locale: lang })) as IntlMessages;
  const pages = messages.pages;
  const pageTitle =
    pagePath in pages ? pages[pagePath as keyof typeof pages] : undefined;
  const title = pageTitle || pages.defaultTitle;
  const description =
    pagePath === '/login'
      ? pages.descriptionLogin || pages.description
      : pagePath === '/signup'
        ? pages.descriptionSignup || pages.description
        : pages.description;
  const keywords =
    pagePath === '/' && pages.keywordsLanding
      ? pages.keywordsLanding.split(',').map((keyword) => keyword.trim())
      : undefined;

  return {
    metadataBase: new URL(
      process.env.NODE_ENV === 'production'
        ? 'https://sexyvoice.ai'
        : 'http://localhost:3000',
    ),
    title: {
      template: parentTitle?.template || '%s | SexyVoice.ai',
      default: title,
    },
    description,
    ...(keywords ? { keywords } : {}),
    openGraph: {
      title: {
        template: '%s | SexyVoice.ai',
        default: pages.defaultTitle,
      },
      description,
      siteName: 'SexyVoice.ai',
      ...(openGraph?.url ? { url: openGraph.url } : {}),
      ...(openGraph?.images ? { images: openGraph.images } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: {
        template: '%s | SexyVoice.ai',
        default: pages.defaultTitle,
      },
      description,
    },
    alternates: {
      canonical: './',
      languages: {
        'x-default': './',
        ...Object.fromEntries(
          routing.locales.map((locale) => [locale, `./${locale}`]),
        ),
      },
    },
  };
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
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
