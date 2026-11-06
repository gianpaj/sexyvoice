import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import type { Graph } from 'schema-dts';

import Footer from '@/components/footer';
import { HeaderStatic } from '@/components/header-static';
import { JsonLd } from '@/components/json-ld';
import type { Locale } from '@/lib/i18n/i18n-config';
import { pageMetadata } from '@/lib/page-metadata';
import { SITE_NAME } from '@/lib/site';
import AudioConverterClient from './audio-converter.client';

interface Props {
  params: Promise<{ lang: Locale }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  const t = await getTranslations({ locale: lang, namespace: 'pages' });

  return {
    ...pageMetadata({
      description: t('descriptionAudioConverter'),
      keywords: t('keywordsAudioConverter'),
      lang,
      path: '/tools/audio-converter',
      title: t('titleAudioConverter'),
    }),
    authors: [{ name: SITE_NAME }],
  };
}

export default async function AudioConverterPage({ params }: Props) {
  const { lang } = await params;
  const t = await getTranslations({
    locale: lang,
    namespace: 'audioConverter',
  });
  const tPages = await getTranslations({ locale: lang, namespace: 'pages' });

  const url = `https://sexyvoice.ai/${lang}/tools/audio-converter`;
  const title = tPages('titleAudioConverter') || t('title');
  const description = tPages('descriptionAudioConverter') || t('subtitle');

  const jsonLd: Graph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@id': `${url}/#webapp`,
        '@type': 'WebApplication',
        applicationCategory: 'MultimediaApplication',
        browserRequirements:
          'Requires a modern browser with WebAssembly support',
        description,
        inLanguage: lang,
        isAccessibleForFree: true,
        name: title,
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'USD',
        },
        operatingSystem: 'Any',
        publisher: {
          '@id': 'https://sexyvoice.ai/#organization',
        },
        url,
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            item: `https://sexyvoice.ai/${lang}`,
            name: 'Home',
            position: 1,
          },
          {
            '@type': 'ListItem',
            item: url,
            name: tPages('/tools/audio-converter') || 'Audio Converter',
            position: 2,
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
        <div className="container mx-auto max-w-3xl px-4 py-12 md:py-20">
          <AudioConverterClient />
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
