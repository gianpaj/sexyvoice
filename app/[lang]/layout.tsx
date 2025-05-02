import { Inter } from 'next/font/google';

import { i18n } from '@/lib/i18n/i18n-config';
import { Providers } from '../providers';

const inter = Inter({ subsets: ['latin'] });

export async function generateStaticParams() {
  return i18n.locales.map((locale) => ({ lang: locale }));
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
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
