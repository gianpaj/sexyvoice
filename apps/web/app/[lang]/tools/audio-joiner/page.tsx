import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import type { Graph } from 'schema-dts';

import Footer from '@/components/footer';
import { HeaderStatic } from '@/components/header-static';
import { JsonLd } from '@/components/json-ld';
import type { Locale } from '@/lib/i18n/i18n-config';
import { routing } from '@/src/i18n/routing';
import AudioJoinerClient from './audio-joiner.client';

interface Props {
  params: Promise<{ lang: Locale }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  const tPages = await getTranslations({ locale: lang, namespace: 'pages' });
  const t = await getTranslations({ locale: lang, namespace: 'audioJoiner' });

  const title = tPages('titleAudioJoiner') || t('title');
  const description = tPages('descriptionAudioJoiner') || t('subtitle');
  const keywords = tPages('keywordsAudioJoiner') || '';

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
        routing.locales.map((locale) => [
          locale,
          `https://sexyvoice.ai/${locale}/tools/audio-joiner`,
        ]),
      ),
    },
  };
}

export default async function AudioJoinerPage({ params }: Props) {
  const { lang } = await params;
  const t = await getTranslations({ locale: lang, namespace: 'audioJoiner' });
  const tPages = await getTranslations({ locale: lang, namespace: 'pages' });

  const url = `https://sexyvoice.ai/${lang}/tools/audio-joiner`;
  const title = tPages('titleAudioJoiner') || t('title');
  const description = tPages('descriptionAudioJoiner') || t('subtitle');

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
            name: tPages('/tools/audio-joiner') || 'Audio Joiner',
            item: url,
          },
        ],
      },
    ],
  };

  return (
    <>
      <JsonLd data={jsonLd} />
      <div className="bg-background">
        <HeaderStatic />
        <div className="container mx-auto max-w-5xl px-4 py-12 md:py-20">
          <AudioJoinerClient />
        </div>
      </div>

      {/* Attribution bar — preserves FFmpeg credit and privacy note */}
      <div className="border-white/5 border-t bg-[hsl(222,84%,3.5%)] py-5 text-center text-muted-foreground text-sm">
        <p>
          {t('footer.poweredBy')}{' '}
          <a
            className="font-semibold text-foreground transition-colors hover:text-primary"
            href="https://ffmpeg.org"
            rel="noopener noreferrer"
            target="_blank"
          >
            {t('footer.ffmpeg')}
          </a>{' '}
          &bull; {t('footer.noUploads')}
        </p>
      </div>
      <Footer lang={lang} />
    </>
  );
}
