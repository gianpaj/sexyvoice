import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import Footer from '@/components/footer';
import { HeaderStatic } from '@/components/header-static';
import { JsonLd } from '@/components/json-ld';
import type { Locale } from '@/lib/i18n/i18n-config';
import { pageMetadata } from '@/lib/page-metadata';
import { SITE_NAME } from '@/lib/site';
import {
  breadcrumbList,
  graph,
  organization,
  webApplication,
} from '@/lib/structured-data';
import AudioJoinerClient from './audio-joiner.client';

interface Props {
  params: Promise<{ lang: Locale }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  const t = await getTranslations({ locale: lang, namespace: 'pages' });

  return {
    ...pageMetadata({
      description: t('descriptionAudioJoiner'),
      keywords: t('keywordsAudioJoiner'),
      lang,
      path: '/tools/audio-joiner',
      title: t('titleAudioJoiner'),
    }),
    authors: [{ name: SITE_NAME }],
  };
}

export default async function AudioJoinerPage({ params }: Props) {
  const { lang } = await params;
  const t = await getTranslations({ locale: lang, namespace: 'audioJoiner' });
  const tPages = await getTranslations({ locale: lang, namespace: 'pages' });
  const tLanding = await getTranslations({
    locale: lang,
    namespace: 'landing',
  });
  const path = '/tools/audio-joiner';

  const jsonLd = graph(
    organization(),
    webApplication({
      description: tPages('descriptionAudioJoiner'),
      extra: { applicationSubCategory: 'Audio Editing' },
      lang,
      name: tPages('titleAudioJoiner'),
      path,
    }),
    breadcrumbList(lang, [
      { name: tLanding('homeLabel'), path: '/' },
      { name: tPages('/tools/audio-joiner'), path },
    ]),
  );

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
