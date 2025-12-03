import type { Metadata, ResolvingMetadata } from 'next';
import { Inter } from 'next/font/google';

import { getDictionary } from '@/lib/i18n/get-dictionary';
import { i18n, type Locale } from '@/lib/i18n/i18n-config';
import { Providers } from '../providers';

const inter = Inter({ subsets: ['latin'] });

export async function generateStaticParams() {
  return i18n.locales.map((locale) => ({ lang: locale }));
}

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

  const dict = await getDictionary(lang);
  // @ts-expect-error FIXME
  const pageTitle = dict.pages[pagePath];
  const defaultTitle = dict.pages.defaultTitle;

  const title = pageTitle || defaultTitle;

  // Get page-specific description based on route
  let description = dict.pages.description;
  if (pagePath === '/login') {
    description = dict.pages.descriptionLogin || dict.pages.description;
  } else if (pagePath === '/signup') {
    description = dict.pages.descriptionSignup || dict.pages.description;
  }

  return {
    title: {
      template: parentTitle?.template || '',
      default: title,
    },
    description,
    openGraph: {
      title,
      description,
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
  params: Promise<{ lang: Locale }>;
}>) {
  return (
    <html lang={(await params).lang}>
      <body className={`${inter.className} dark`} suppressHydrationWarning>
        <a className="sr-only focus:not-sr-only" href="#main-content">
          Skip to main content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
