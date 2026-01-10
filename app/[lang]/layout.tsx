import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import type { Metadata, ResolvingMetadata } from 'next';
import { Inter } from 'next/font/google';

import { getDictionary } from '@/lib/i18n/get-dictionary';
import { i18n, type Locale } from '@/lib/i18n/i18n-config';
import { Providers } from '../providers';

const inter = Inter({ subsets: ['latin'] });

export async function generateStaticParams() {
  return i18n.locales.map((locale) => ({ lang: locale }));
}

import '../globals.css';

interface Props {
  params: Promise<{ lang: Locale }>;
}

export async function generateMetadata(
  { params }: Props,
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const lang = (await params).lang;

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

  const dict = await getDictionary(lang, 'pages');
  // @ts-expect-error FIXME
  const pageTitle = dict[pagePath];
  const defaultTitle = dict.defaultTitle;

  const title = pageTitle || defaultTitle;

  // Get page-specific description based on route
  let description = dict.description;
  if (pagePath === '/login') {
    description = dict.descriptionLogin || dict.description;
  } else if (pagePath === '/signup') {
    description = dict.descriptionSignup || dict.description;
  }

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
    openGraph: {
      title: {
        template: '%s | SexyVoice.ai',
        default: 'SexyVoice.ai - Free Text to Speech & AI Voice Generator',
      },
      description,
      ...(openGraph?.url ? { url: openGraph.url } : {}),
      ...(openGraph?.images ? { images: openGraph.images } : {}),
      ...(openGraph?.siteName ? { siteName: openGraph.siteName } : {}),
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
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ lang: Locale }>;
}>) {
  return (
    <html lang={(await params).lang}>
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
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
