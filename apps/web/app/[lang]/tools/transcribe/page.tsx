import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { ToolPage } from '@/components/marketing-page';
import type { Locale } from '@/lib/i18n/i18n-config';
import { pageMetadata } from '@/lib/page-metadata';
import { SITE_NAME, SITE_URL } from '@/lib/site';
import {
  breadcrumbList,
  faqPage,
  graph,
  howTo,
  organization,
  webApplication,
} from '@/lib/structured-data';
import { WHISPER_MODELS } from './components/models';
import TranscribeClient from './transcribe.client';

interface Props {
  params: Promise<{ lang: Locale }>;
}

const HOW_TO_STEPS = [
  'open',
  'addAudio',
  'chooseModel',
  'selectLanguage',
  'transcribe',
  'copy',
] as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  const t = await getTranslations({ locale: lang, namespace: 'pages' });

  return {
    ...pageMetadata({
      description: t('descriptionTranscribe'),
      image: {
        alt: t('titleTranscribe'),
        height: 630,
        url: '/posts/free-audio-transcription-tool.webp',
        width: 1200,
      },
      keywords: t('keywordsTranscribe'),
      lang,
      path: '/tools/transcribe',
      title: t('titleTranscribe'),
    }),
    authors: [{ name: SITE_NAME }],
  };
}

export default async function TranscribePage({ params }: Props) {
  const { lang } = await params;
  const t = await getTranslations({ locale: lang, namespace: 'transcribe' });
  const tPages = await getTranslations({ locale: lang, namespace: 'pages' });
  const rawFaqItems = t.raw('faq.items');
  const faqItems = (Array.isArray(rawFaqItems) ? rawFaqItems : []) as Array<{
    question: string;
    answer: string;
  }>;

  const tLanding = await getTranslations({
    locale: lang,
    namespace: 'landing',
  });
  const path = '/tools/transcribe';
  const title = tPages('titleTranscribe');
  const description = tPages('descriptionTranscribe');

  const jsonLd = graph(
    organization(),
    webApplication({
      description,
      extra: {
        applicationSubCategory: 'Audio Transcription',
        featureList: t('howTo.featureList'),
        screenshot: `${SITE_URL}/posts/free-audio-transcription-tool.webp`,
      },
      lang,
      name: title,
      path,
    }),
    howTo({
      description,
      lang,
      name: title,
      path,
      steps: HOW_TO_STEPS.map((step) => ({
        name: t(`howTo.${step}.name`),
        text: t(`howTo.${step}.text`, {
          button: t('loadAndTranscribe'),
          small: WHISPER_MODELS[2].label,
          tiny: WHISPER_MODELS[0].label,
          transcribe: t('languageSelector.transcribe'),
          translate: t('languageSelector.translate'),
        }),
      })),
      totalTime: 'PT2M',
    }),
    faqPage({ lang, path, questions: faqItems }),
    breadcrumbList(lang, [
      { name: tLanding('homeLabel'), path: '/' },
      { name: tPages('/tools/transcribe'), path },
    ]),
  );

  return (
    <ToolPage
      credits={[
        {
          href: 'https://huggingface.co/docs/transformers.js',
          label: t('footer.transformersJs'),
        },
        {
          href: 'https://openai.com/index/whisper/',
          label: t('footer.whisper'),
        },
      ]}
      jsonLd={jsonLd}
      lang={lang}
      noUploads={t('footer.noUploads')}
      poweredBy={t('footer.poweredBy')}
      width="max-w-3xl"
    >
      <TranscribeClient lang={lang} />

      {/* Server-rendered FAQ — crawlable without JavaScript */}
      <section
        aria-labelledby="faq-heading"
        className="mt-16 border-border/50 border-t pt-12"
        id="faq"
      >
        <h2
          className="mb-8 font-semibold text-foreground text-xl"
          id="faq-heading"
        >
          {t('faq.title')}
        </h2>
        <dl className="space-y-6">
          {faqItems.map((item) => (
            <div key={item.question}>
              <dt className="mb-1.5 font-medium text-foreground text-sm">
                {item.question}
              </dt>
              <dd className="text-muted-foreground text-sm leading-relaxed">
                {item.answer}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </ToolPage>
  );
}
