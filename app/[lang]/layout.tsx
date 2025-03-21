import { Inter } from 'next/font/google';
import type { Locale } from '@/lib/i18n/i18n-config';
import { i18n } from '@/lib/i18n/i18n-config';
import '../globals.css';
import { Providers } from '../providers';
import { Header } from '@/components/header';

const inter = Inter({ subsets: ['latin'] });

export async function generateStaticParams() {
  return i18n.locales.map((locale) => ({ lang: locale }));
}

export default function RootLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { lang: Locale };
}) {
  return (
    <html lang={params.lang} suppressHydrationWarning>
      <body className={`${inter.className} dark`} suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
