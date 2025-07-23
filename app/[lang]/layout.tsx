import { Inter } from 'next/font/google';

import { i18n } from '@/lib/i18n/i18n-config';
import { Providers } from '../providers';
import { Metadata, ResolvingMetadata } from 'next';
import { getDictionary } from '@/lib/i18n/get-dictionary';

const inter = Inter({ subsets: ['latin'] });

export async function generateStaticParams() {
  return i18n.locales.map((locale) => ({ lang: locale }));
}

type Props = {
  params: Promise<{ lang: 'en' | 'es' }>;
};

export async function generateMetadata(
  { params }: Props,
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const lang = (await params).lang;

  const { alternates, openGraph } = await parent;

  const pathname = new URL(alternates?.canonical?.url!).pathname;

  const dict = await getDictionary(lang);
  // @ts-ignore FIXME
  const title = dict.pages[pathname.replace(`/${lang}`, '')];
  return {
    ...(title ? { title } : {}),
    description: dict.pages.description,
    openGraph: {
      // ...openGraph,
      ...(title ? { title } : {}),
      ...(openGraph?.url ? { url: openGraph.url } : {}),
      ...(openGraph?.images ? { images: openGraph.images } : {}),
      ...(openGraph?.siteName ? { siteName: openGraph.siteName } : {}),
      description: dict.pages.description,
    },
  };
}

export default async function LangLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ lang: 'es' | 'de' }>;
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
