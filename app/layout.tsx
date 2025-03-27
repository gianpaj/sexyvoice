import './globals.css';
import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/next';
import { Inter } from 'next/font/google';
import { SpeedInsights } from '@vercel/speed-insights/next';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NODE_ENV === 'production'
      ? 'https://sexyvoice.ai'
      : 'http://localhost:3000',
  ),
  title: 'SexyVoice.ai - Free Text to Speech & AI Voice Generator',
  description:
    'Create stunning voice clones with advanced AI technology. Perfect for content creators, developers, and storytellers.',
  openGraph: {
    title: 'SexyVoice.ai',
    siteName: 'SexyVoice.ai',
    url: 'https://sexyvoice.ai',
    description:
      'Create stunning voice clones with advanced AI technology. Perfect for content creators, developers, and storytellers.',
    images: [{ url: '/sexyvoice.ai-og-image.jpg' }],
  },
  alternates: {
    canonical: '/',
    languages: {
      en: '/en',
      es: '/es',
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
        {children}
        {process.env.NODE_ENVODE_ENV === 'production' && (
          <>
            <Analytics debug={false} />
            <SpeedInsights debug={false} />
          </>
        )}
      </body>
    </html>
  );
}
