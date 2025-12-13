import './globals.css';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';

import { i18n } from '@/lib/i18n/i18n-config';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NODE_ENV === 'production'
      ? 'https://sexyvoice.ai'
      : 'http://localhost:3000',
  ),
  title: {
    template: '%s | SexyVoice.ai',
    default: 'SexyVoice.ai - Free Text to Speech & AI Voice Generator',
  },
  openGraph: {
    title: {
      template: '%s | SexyVoice.ai',
      default: 'SexyVoice.ai - Free Text to Speech & AI Voice Generator',
    },
    siteName: 'SexyVoice.ai',
    url: 'https://sexyvoice.ai',
    images: [{ url: '/sexyvoice.ai-og-image.jpg' }],
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} dark`} suppressHydrationWarning>
        <a className="sr-only focus:not-sr-only" href="#main-content">
          Skip to main content
        </a>
        {children}
        {process.env.NODE_ENV === 'production' && (
          <>
            <Analytics debug={false} />
            <SpeedInsights debug={false} />
          </>
        )}
      </body>
    </html>
  );
}
