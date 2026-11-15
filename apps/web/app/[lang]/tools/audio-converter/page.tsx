import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { ToolPage } from '@/components/marketing-page';
import type { Locale } from '@/lib/i18n/i18n-config';
import { pageMetadata } from '@/lib/page-metadata';
import { SITE_NAME } from '@/lib/site';
import {
  breadcrumbList,
  graph,
  organization,
  webApplication,
} from '@/lib/structured-data';
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
  const tLanding = await getTranslations({
    locale: lang,
    namespace: 'landing',
  });
  const path = '/tools/audio-converter';

  const jsonLd = graph(
    organization(),
    webApplication({
      description: tPages('descriptionAudioConverter'),
      lang,
      name: tPages('titleAudioConverter'),
      path,
    }),
    breadcrumbList(lang, [
      { name: tLanding('homeLabel'), path: '/' },
      { name: tPages('/tools/audio-converter'), path },
    ]),
  );

  return (
    <ToolPage
      credits={[{ href: 'https://ffmpeg.org', label: t('footer.ffmpeg') }]}
      jsonLd={jsonLd}
      lang={lang}
      noUploads={t('footer.noUploads')}
      poweredBy={t('footer.poweredBy')}
      width="max-w-3xl"
    >
      <AudioConverterClient />
    </ToolPage>
  );
}
