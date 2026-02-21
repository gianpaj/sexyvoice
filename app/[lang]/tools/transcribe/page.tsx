import Link from 'next/link';
import type { Metadata } from 'next';
import Script from 'next/script';

import { HeaderStatic } from '@/components/header-static';
import { getDictionary } from '@/lib/i18n/get-dictionary';
import { i18n, type Locale } from '@/lib/i18n/i18n-config';
import TranscribeClient from './transcribe.client';

interface Props {
  params: Promise<{ lang: Locale }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  const dict = await getDictionary(lang, 'transcribe');

  const pageUrl = `https://sexyvoice.ai/${lang}/tools/transcribe`;
  const { title, description, keywords } = dict.metadata;

  return {
    title: { absolute: `${title} | SexyVoice.ai` },
    description,
    keywords,
    authors: [{ name: 'SexyVoice.ai', url: 'https://sexyvoice.ai' }],
    openGraph: {
      title,
      description,
      url: pageUrl,
      siteName: 'SexyVoice.ai',
      images: [
        {
          url: '/sexyvoice.ai-og-image.jpg',
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
      locale: lang,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ['/sexyvoice.ai-og-image.jpg'],
    },
    alternates: {
      canonical: pageUrl,
      languages: Object.fromEntries(
        i18n.locales.map((locale) => [
          locale,
          `https://sexyvoice.ai/${locale}/tools/transcribe`,
        ]),
      ),
    },
  };
}

export default async function TranscribePage({ params }: Props) {
  const { lang } = await params;
  const dict = await getDictionary(lang, 'transcribe');
  const dictHeader = await getDictionary(lang, 'header');

  const pageUrl = `https://sexyvoice.ai/${lang}/tools/transcribe`;
  const { title, description } = dict.metadata;

  const webAppSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: title,
    description,
    url: pageUrl,
    applicationCategory: 'UtilitiesApplication',
    operatingSystem: 'Web Browser',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
    featureList: [
      'Local in-browser processing',
      'No file uploads required',
      '99+ language support',
      'OpenAI Whisper powered',
      'Microphone recording',
      'Free to use',
    ],
    publisher: {
      '@type': 'Organization',
      name: 'SexyVoice.ai',
      url: 'https://sexyvoice.ai',
    },
    inLanguage: lang,
  };

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: `https://sexyvoice.ai/${lang}`,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: title,
        item: pageUrl,
      },
    ],
  };

  return (
    <>
      <Script id="webapp-schema" type="application/ld+json">
        {JSON.stringify(webAppSchema)}
      </Script>
      <Script id="breadcrumb-schema" type="application/ld+json">
        {JSON.stringify(breadcrumbSchema)}
      </Script>
      <div className="min-h-screen bg-background">
        <HeaderStatic dict={dictHeader} lang={lang} />
        <div className="container mx-auto max-w-3xl px-4 py-12 md:py-20">
          <TranscribeClient dict={dict} lang={lang} />
          <footer className="mt-12 text-center text-muted-foreground text-sm">
            <p>
              {dict.footer.poweredBy}{' '}
              <a
                className="font-semibold text-foreground transition-colors hover:text-primary"
                href="https://huggingface.co/docs/transformers.js"
                rel="noopener noreferrer"
                target="_blank"
              >
                {dict.footer.transformersJs}
              </a>{' '}
              &bull;{' '}
              <a
                className="font-semibold text-foreground transition-colors hover:text-primary"
                href="https://openai.com/index/whisper/"
                rel="noopener noreferrer"
                target="_blank"
              >
                {dict.footer.whisper}
              </a>{' '}
              &bull; {dict.footer.noUploads}
            </p>
            <p className="mt-2 opacity-70">
              <Link
                className="transition-colors hover:text-foreground"
                href={`/${lang}`}
              >
                {dict.footer.madeWith}
              </Link>
            </p>
          </footer>
        </div>
      </div>
    </>
  );
}
