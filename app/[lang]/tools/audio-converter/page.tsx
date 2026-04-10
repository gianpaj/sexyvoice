import type { Metadata } from 'next';
import Script from 'next/script';
import { getMessages } from 'next-intl/server';
import type { Graph } from 'schema-dts';

import Footer from '@/components/footer';
import { HeaderStatic } from '@/components/header-static';
import type { Locale } from '@/lib/i18n/i18n-config';
import { routing } from '@/src/i18n/routing';
import AudioConverterClient from './audio-converter.client';

interface Props {
  params: Promise<{ lang: Locale }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  const messages = (await getMessages({ locale: lang })) as IntlMessages;
  const dict = messages.pages;
  const dictAudioConverter = messages.audioConverter;

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
        routing.locales.map((locale) => [
          locale,
          `https://sexyvoice.ai/${locale}/tools/audio-converter`,
        ]),
      ),
    },
  };
}

export default async function AudioConverterPage({ params }: Props) {
  const { lang } = await params;
  const messages = (await getMessages({ locale: lang })) as IntlMessages;
  const dict = messages.audioConverter;
  const dictPages = messages.pages;

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
      <div className="bg-background">
        <HeaderStatic />
        <div className="container mx-auto max-w-3xl px-4 py-12 md:py-20">
          <AudioConverterClient dict={dict} />
        </div>
      </div>

      {/* Attribution bar — preserves FFmpeg credit and privacy note */}
      <div className="border-white/5 border-t bg-[hsl(222,84%,3.5%)] py-5 text-center text-muted-foreground text-sm">
        <p>
          {dict.footer.poweredBy}{' '}
          <a
            className="font-semibold text-foreground transition-colors hover:text-primary"
            href="https://ffmpeg.org"
            rel="noopener noreferrer"
            target="_blank"
          >
            {dict.footer.ffmpeg}
          </a>{' '}
          &bull; {dict.footer.noUploads}
        </p>
      </div>
      <Footer lang={lang} />
    </>
  );
}
