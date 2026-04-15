import { RootProvider } from 'fumadocs-ui/provider/next';
import './global.css';
import { Inter } from 'next/font/google';
import { Metadata } from 'next';

const inter = Inter({
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://docs.sexyvoice.ai'),
  alternates: {
    types: {
      'application/rss+xml': [
        {
          title: 'SexyVoice Docs',
          url: 'https://docs.sexyvoice.ai/index.xml',
        },
      ],
    },
  },
};

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html className={inter.className} lang="en" suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
