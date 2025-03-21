import './globals.css';
import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/next';
import { Inter } from 'next/font/google';
import { SpeedInsights } from '@vercel/speed-insights/next';
const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'SexyVoice.ai - AI Voice Cloning Platform',
  description:
    'Create stunning voice clones with advanced AI technology. Perfect for content creators, developers, and storytellers.',
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
