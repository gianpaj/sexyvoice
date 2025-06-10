import './globals.css';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NODE_ENV === 'production'
      ? 'https://sexyvoice.ai'
      : 'http://localhost:3000',
  ),
  title: 'SexyVoice.ai - Free Text to Speech & AI Voice Generator',
  description:
    'Create stunning voice clones with advanced AI technology. Our easy-to-use platform helps content creators, developers, and storytellers bring their projects to life with realistic voices.',
  openGraph: {
    title: 'SexyVoice.ai',
    siteName: 'SexyVoice.ai',
    url: 'https://sexyvoice.ai',
    description:
      'Create stunning voice clones with advanced AI technology. Our easy-to-use platform helps content creators, developers, and storytellers bring their projects to life with realistic voices.',
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
        <a href="#main-content" className="sr-only focus:not-sr-only">
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
