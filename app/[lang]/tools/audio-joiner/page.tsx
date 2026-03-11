import type { Metadata } from 'next';
import { getMessages } from 'next-intl/server';
import Link from 'next/link';
import Script from 'next/script';
import type { Graph } from 'schema-dts';

import { HeaderStatic } from '@/components/header-static';
import { i18n, type Locale } from '@/lib/i18n/i18n-config';
import AudioJoinerClient from './audio-joiner.client';

interface Props {
  params: Promise<{ lang: Locale }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  const messages = (await getMessages({ locale: lang })) as IntlMessages;
  const dictPages = messages.pages;
  const dictAudioJoiner = messages.audioJoiner;

  const title = dictPages.titleAudioJoiner || dictAudioJoiner.title;
  const description =
    dictPages.descriptionAudioJoiner || dictAudioJoiner.subtitle;
  const keywords = dictPages.keywordsAudioJoiner || '';

  const keywordsArray = keywords
    ? keywords.split(',').map((keyword: string) => keyword.trim())
    : [
        'free audio joiner',
        'merge audio files',
        'combine mp3 files',
        'audio trimmer',
        'browser audio editor',
      ];

  const url = `https://sexyvoice.ai/${lang}/tools/audio-joiner`;

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
          `https://sexyvoice.ai/${locale}/tools/audio-joiner`,
        ]),
      ),
    },
  };
}

export default async function AudioJoinerPage({ params }: Props) {
  const { lang } = await params;
  const messages = (await getMessages({ locale: lang })) as IntlMessages;
  const dict = messages.audioJoiner;
  const dictPages = messages.pages;

  const url = `https://sexyvoice.ai/${lang}/tools/audio-joiner`;
  const title = dictPages.titleAudioJoiner || dict.title;
  const description = dictPages.descriptionAudioJoiner || dict.subtitle;

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
        applicationSubCategory: 'Audio Editing',
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
            name: dictPages['/tools/audio-joiner'] || 'Audio Joiner',
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
        <HeaderStatic />
        <div className="container mx-auto max-w-5xl px-4 py-12 md:py-20">
          <AudioJoinerClient dict={dict} />
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
                href={`/${lang}/tools/audio-converter`}
              >
                {dict.footer.audioConverterLink}
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
