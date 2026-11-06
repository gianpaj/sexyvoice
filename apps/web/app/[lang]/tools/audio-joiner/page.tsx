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
    <ToolPage
      credits={[{ href: 'https://ffmpeg.org', label: t('footer.ffmpeg') }]}
      jsonLd={jsonLd}
      lang={lang}
      noUploads={t('footer.noUploads')}
      poweredBy={t('footer.poweredBy')}
      width="max-w-5xl"
    >
      <AudioJoinerClient />
    </ToolPage>
  );
}
