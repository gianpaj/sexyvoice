import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import type { Graph } from 'schema-dts';

import Footer from '@/components/footer';
import { HeaderStatic } from '@/components/header-static';
import { JsonLd } from '@/components/json-ld';
import type { Locale } from '@/lib/i18n/i18n-config';
import { routing } from '@/src/i18n/routing';
import TranscribeClient from './transcribe.client';

interface Props {
  params: Promise<{ lang: Locale }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  const tPages = await getTranslations({ locale: lang, namespace: 'pages' });
  const t = await getTranslations({ locale: lang, namespace: 'transcribe' });

  const title = tPages('titleTranscribe') || t('title');
  const description = tPages('descriptionTranscribe') || t('subtitle');
  const keywords = tPages('keywordsTranscribe') || '';
  const keywordsArray = keywords
    ? keywords.split(',').map((k: string) => k.trim())
    : [
        'free audio transcription',
        'transcribe audio',
        'speech to text',
        'audio to text',
        'whisper transcription',
        'openai whisper',
        'offline transcription',
        'browser transcription',
        'voice to text',
        'free speech recognition',
      ];

  const url = `https://sexyvoice.ai/${lang}/tools/transcribe`;

  return {
    alternates: {
      canonical: url,
      languages: Object.fromEntries(
        routing.locales.map((locale) => [
          locale,
          `https://sexyvoice.ai/${locale}/tools/transcribe`,
        ]),
      ),
    },
    authors: [{ name: 'SexyVoice.ai' }],
    description,
    keywords: keywordsArray,
    openGraph: {
      description,
      images: [
        {
          alt: title,
          height: 630,
          url: 'https://sexyvoice.ai/posts/free-audio-transcription-tool.webp',
          width: 1200,
        },
      ],
      locale: lang,
      siteName: 'SexyVoice.ai',
      title: `${title} | SexyVoice.ai`,
      type: 'website',
      url,
    },
    title,
    twitter: {
      card: 'summary_large_image',
      description,
      images: ['https://sexyvoice.ai/posts/free-audio-transcription-tool.webp'],
      title: `${title} | SexyVoice.ai`,
    },
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

  const url = `https://sexyvoice.ai/${lang}/tools/transcribe`;
  const title = tPages('titleTranscribe') || t('title');
  const description = tPages('descriptionTranscribe') || t('subtitle');

  const jsonLd: Graph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@id': `${url}/#webapp`,
        '@type': 'WebApplication',
        applicationCategory: 'MultimediaApplication',
        applicationSubCategory: 'Audio Transcription',
        browserRequirements:
          'Requires a modern browser with WebAssembly support',
        description,
        featureList:
          'Audio transcription, Speech to text, 99+ languages, Offline processing, Timestamp generation, Video transcription, Translate to English',
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
        screenshot:
          'https://sexyvoice.ai/posts/free-audio-transcription-tool.webp',
        url,
      },
      {
        '@id': `${url}/#howto`,
        '@type': 'HowTo',
        description,
        inLanguage: lang,
        name: title,
        step: [
          {
            '@type': 'HowToStep',
            name: 'Open the transcription tool',
            position: 1,
            text: 'Navigate to the free audio transcription tool on SexyVoice.ai.',
            url,
          },
          {
            '@type': 'HowToStep',
            name: 'Add your audio',
            position: 2,
            text: 'Drag and drop an audio or video file onto the upload zone, click to browse, or record directly with your microphone.',
            url,
          },
          {
            '@type': 'HowToStep',
            name: 'Choose a Whisper model',
            position: 3,
            text: 'Select Whisper Tiny (~40 MB) for fast transcription or Whisper Small (~250 MB) for higher accuracy.',
            url,
          },
          {
            '@type': 'HowToStep',
            name: 'Select language and task',
            position: 4,
            text: 'Pick the language of your audio. Choose "Transcribe" to keep the original language, or "Translate" to convert to English.',
            url,
          },
          {
            '@type': 'HowToStep',
            name: 'Transcribe',
            position: 5,
            text: 'Click "Load Model & Transcribe". The model downloads once and is cached for future use.',
            url,
          },
          {
            '@type': 'HowToStep',
            name: 'Copy your transcript',
            position: 6,
            text: 'Your timestamped transcript appears instantly. Copy it with one click.',
            url,
          },
        ],
        totalTime: 'PT2M',
      },
      {
        '@id': `${url}/#faq`,
        '@type': 'FAQPage',
        inLanguage: lang,
        mainEntity: faqItems.map((item) => ({
          '@type': 'Question',
          acceptedAnswer: {
            '@type': 'Answer',
            text: item.answer,
          },
          name: item.question,
        })),
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
            name: tPages('/tools/transcribe') || 'Audio Transcription',
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
        </div>
      </div>

      {/* Attribution bar — preserves Whisper/Transformers.js credit and privacy note */}
      <div className="border-white/5 border-t bg-[hsl(222,84%,3.5%)] py-5 text-center text-muted-foreground text-sm">
        <p>
          {t('footer.poweredBy')}{' '}
          <a
            className="font-semibold text-foreground transition-colors hover:text-primary"
            href="https://huggingface.co/docs/transformers.js"
            rel="noopener noreferrer"
            target="_blank"
          >
            {t('footer.transformersJs')}
          </a>{' '}
          &bull;{' '}
          <a
            className="font-semibold text-foreground transition-colors hover:text-primary"
            href="https://openai.com/index/whisper/"
            rel="noopener noreferrer"
            target="_blank"
          >
            {t('footer.whisper')}
          </a>{' '}
          &bull; {t('footer.noUploads')}
        </p>
      </div>
      <Footer lang={lang} />
    </>
  );
}
