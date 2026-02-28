import type { Metadata } from 'next';
import Link from 'next/link';
import Script from 'next/script';
import type { Graph } from 'schema-dts';

import { HeaderStatic } from '@/components/header-static';
import { getDictionary } from '@/lib/i18n/get-dictionary';
import { i18n, type Locale } from '@/lib/i18n/i18n-config';
import AudioConverterClient from './audio-converter.client';

interface Props {
  params: Promise<{ lang: Locale }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  const dict = await getDictionary(lang, 'pages');
  const dictAudioConverter = await getDictionary(lang, 'audioConverter');

  const title = dict.titleAudioConverter || dictAudioConverter.title;
  const description =
    dict.descriptionAudioConverter || dictAudioConverter.subtitle;
  const keywords = dict.keywordsAudioConverter || '';
  const keywordsArray = keywords
    ? keywords.split(',').map((k: string) => k.trim())
    : [
        'free audio converter',
        'convert mp3',
        'convert wav',
        'convert flac',
        'online audio converter',
        'browser audio converter',
        'offline audio converter',
        'ffmpeg online',
        'no upload audio converter',
        'private audio converter',
      ];

  const url = `https://sexyvoice.ai/${lang}/tools/audio-converter`;

  return {
    title,
    description,
    keywords: keywordsArray,
    authors: [{ name: 'SexyVoice.ai' }],
    openGraph: {
      title: `${title} | SexyVoice.ai`,
      description,
      url,
      siteName: 'SexyVoice.ai',
      type: 'website',
      locale: lang,
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} | SexyVoice.ai`,
      description,
    },
    alternates: {
      canonical: url,
      languages: Object.fromEntries(
        i18n.locales.map((locale) => [
          locale,
          `https://sexyvoice.ai/${locale}/tools/audio-converter`,
        ]),
      ),
    },
  };
}

export default async function AudioConverterPage({ params }: Props) {
  const { lang } = await params;
  const dict = await getDictionary(lang, 'audioConverter');
  const dictPages = await getDictionary(lang, 'pages');
  const dictHeader = await getDictionary(lang, 'header');

  const url = `https://sexyvoice.ai/${lang}/tools/audio-converter`;
  const title = dictPages.titleAudioConverter || dict.title;
  const description = dictPages.descriptionAudioConverter || dict.subtitle;

  const jsonLd: Graph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebApplication',
        '@id': `${url}/#webapp`,
        name: title,
        description,
        url,
        applicationCategory: 'MultimediaApplication',
        operatingSystem: 'Any',
        browserRequirements:
          'Requires a modern browser with WebAssembly support',
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'USD',
        },
        isAccessibleForFree: true,
        inLanguage: lang,
        publisher: {
          '@id': 'https://sexyvoice.ai/#organization',
        },
      },
      {
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
            name: dictPages['/tools/audio-converter'] || 'Audio Converter',
            item: url,
          },
        ],
      },
    ],
  };

  return (
    <>
      <Script type="application/ld+json">{JSON.stringify(jsonLd)}</Script>
      <div className="min-h-screen bg-background">
        <HeaderStatic dict={dictHeader} lang={lang} />
        <div className="container mx-auto max-w-3xl px-4 py-12 md:py-20">
          <AudioConverterClient dict={dict} />
          <footer className="mt-12 text-center text-muted-foreground text-sm">
            <p>
              {dict.footer.poweredBy}{' '}
              <span className="font-semibold text-foreground">
                {dict.footer.ffmpeg}
              </span>{' '}
              &bull; {dict.footer.noUploads}
            </p>
            <p className="mt-4">
              {dict.footer.alsoTry}{' '}
              <Link
                className="font-semibold text-foreground transition-colors hover:text-primary"
                href={`/${lang}/tools/transcribe`}
              >
                {dict.footer.transcribeLink}
              </Link>
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
