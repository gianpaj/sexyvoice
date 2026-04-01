import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import type { Metadata, ResolvingMetadata } from 'next';
import { Inter } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';

import { i18n, type Locale } from '@/lib/i18n/i18n-config';
import '../globals.css';

import { Providers } from '../providers';

const inter = Inter({ subsets: ['latin'] });

interface Props {
  children: React.ReactNode;
  params: Promise<{ lang: Locale }>;
}

export async function generateStaticParams() {
  return i18n.locales.map((lang) => ({ lang }));
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

  if (!i18n.locales.includes(lang)) {
    return {
      title:
        'SexyVoice.ai – Free AI Text-to-Speech & Voice Generator for Adults - NSFW and moan',
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
          i18n.locales.map((locale) => [locale, `./${locale}`]),
        ),
      },
    },
  };
}

export default async function LangLayout({
  children,
  params,
}: Readonly<Props>) {
  const { lang } = await params;
  const messages = await getMessages({ locale: lang });

  return (
    <html lang={lang}>
      <body className={`${inter.className} dark`} suppressHydrationWarning>
        <a className="sr-only focus:not-sr-only" href="#main-content">
          Skip to main content
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
