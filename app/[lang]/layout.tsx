import type { Metadata, ResolvingMetadata } from 'next';
import { Inter } from 'next/font/google';

import { getDictionary } from '@/lib/i18n/get-dictionary';
import { i18n, type Locale } from '@/lib/i18n/i18n-config';
import { Providers } from '../providers';

const inter = Inter({ subsets: ['latin'] });

export async function generateStaticParams() {
  return i18n.locales.map((locale) => ({ lang: locale }));
}

type Props = {
  params: Promise<{ lang: Locale }>;
};

export async function generateMetadata(
  { params }: Props,
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const lang = (await params).lang;

  const { alternates, openGraph, title: parentTitle } = await parent;

  const pathname = new URL(alternates?.canonical?.url!).pathname;
  const pagePath = pathname.replace(`/${lang}`, '') || '/';

  const dict = await getDictionary(lang);
  // @ts-ignore FIXME
  const pageTitle = dict.pages[pagePath];
  const defaultTitle = dict.pages.defaultTitle;

  const title = pageTitle || defaultTitle;

  return {
    title: {
      template: (parentTitle as any).template,
      default: title,
    },
    description: dict.pages.description,
    openGraph: {
      title: title,
      description: dict.pages.description,
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
        <a href="#main-content" className="sr-only focus:not-sr-only">
          Skip to main content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
