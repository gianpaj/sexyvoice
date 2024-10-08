import { Toaster } from 'react-hot-toast'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import { Analytics } from '@vercel/analytics/react'
import type { Metadata } from 'next'

import '@/app/globals.scss'
import { cn } from '@/lib/utils'
import { TailwindIndicator } from '@/components/tailwind-indicator'
import { Providers } from '@/components/providers'
import { Header } from '@/components/header'

export const metadata: Metadata = {
  metadataBase: new URL(`https://${process.env.VERCEL_URL}`),
  title: {
    default: "SexyVoice.ai - The last girlfriend you'll need",
    template: `%s - SexyVoice.ai - The last girlfriend you'll need`
  },
  description:
    'An AI-powered chatbot for your pleasure ;) AI Girlfriend. AI Boyfriend. AI Friend. AI Lover. AI Companion. AI Virtual Girlfriend. AI Virtual Boyfriend. AI Virtual Friend.',
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon-16x16.png',
    apple: '/apple-touch-icon.png'
  },
  openGraph: {
    images: [
      {
        url: '/sexyvoice.ai-og-image.jpg',
        width: 1200,
        height: 711,
        alt: 'SexyVoice.ai - The last girlfriend you will need'
      }
    ]
  },
  alternates: {
    canonical: 'https://sexyvoice.ai'
  }
}

export const viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: 'white' },
    { media: '(prefers-color-scheme: dark)', color: 'black' }
  ]
}

interface RootLayoutProps {
  children: React.ReactNode
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body
        className={cn(
          'font-sans antialiased',
          GeistSans.variable,
          GeistMono.variable
        )}
        suppressHydrationWarning
      >
        <Toaster />
        <Providers
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <div className="flex min-h-screen flex-col">
            <Header />
            <main className="flex flex-1 flex-col bg-muted/50">{children}</main>
          </div>
          <TailwindIndicator />
        </Providers>
        <Analytics
        // beforeSend={(event) => {
        //   // TODO
        //   if (event.url.includes('/private')) {
        //     return null;
        //   }
        //   return event;
        // }}
        />
      </body>
    </html>
  )
}
