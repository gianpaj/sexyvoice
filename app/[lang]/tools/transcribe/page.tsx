import type { Metadata } from 'next';
import Link from 'next/link';
import Script from 'next/script';
import type { Graph } from 'schema-dts';

import { HeaderStatic } from '@/components/header-static';
import { getDictionary } from '@/lib/i18n/get-dictionary';
import { i18n, type Locale } from '@/lib/i18n/i18n-config';
import TranscribeClient from './transcribe.client';

interface Props {
  params: Promise<{ lang: Locale }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  const dict = await getDictionary(lang, 'pages');
  const dictTranscribe = await getDictionary(lang, 'transcribe');

  const title = dict.titleTranscribe || dictTranscribe.title;
  const description = dict.descriptionTranscribe || dictTranscribe.subtitle;
  const keywords = dict.keywordsTranscribe || '';
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
      images: [
        {
          url: 'https://sexyvoice.ai/posts/free-audio-transcription-tool.webp',
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} | SexyVoice.ai`,
      description,
      images: ['https://sexyvoice.ai/posts/free-audio-transcription-tool.webp'],
    },
    alternates: {
      canonical: url,
      languages: Object.fromEntries(
        i18n.locales.map((locale) => [
          locale,
          `https://sexyvoice.ai/${locale}/tools/transcribe`,
        ]),
      ),
    },
  };
}

export default async function TranscribePage({ params }: Props) {
  const { lang } = await params;
  const dict = await getDictionary(lang, 'transcribe');
  const dictPages = await getDictionary(lang, 'pages');
  const dictHeader = await getDictionary(lang, 'header');

  const url = `https://sexyvoice.ai/${lang}/tools/transcribe`;
  const title = dictPages.titleTranscribe || dict.title;
  const description = dictPages.descriptionTranscribe || dict.subtitle;

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
        applicationSubCategory: 'Audio Transcription',
        operatingSystem: 'Any',
        browserRequirements:
          'Requires a modern browser with WebAssembly support',
        featureList:
          'Audio transcription, Speech to text, 99+ languages, Offline processing, Timestamp generation, Video transcription, Translate to English',
        screenshot:
          'https://sexyvoice.ai/posts/free-audio-transcription-tool.webp',
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
        '@type': 'HowTo',
        '@id': `${url}/#howto`,
        name: title,
        description,
        inLanguage: lang,
        totalTime: 'PT2M',
        step: [
          {
            '@type': 'HowToStep',
            position: 1,
            name: 'Open the transcription tool',
            text: 'Navigate to the free audio transcription tool on SexyVoice.ai.',
            url,
          },
          {
            '@type': 'HowToStep',
            position: 2,
            name: 'Add your audio',
            text: 'Drag and drop an audio or video file onto the upload zone, click to browse, or record directly with your microphone.',
            url,
          },
          {
            '@type': 'HowToStep',
            position: 3,
            name: 'Choose a Whisper model',
            text: 'Select Whisper Tiny (~40 MB) for fast transcription or Whisper Small (~250 MB) for higher accuracy.',
            url,
          },
          {
            '@type': 'HowToStep',
            position: 4,
            name: 'Select language and task',
            text: 'Pick the language of your audio. Choose "Transcribe" to keep the original language, or "Translate" to convert to English.',
            url,
          },
          {
            '@type': 'HowToStep',
            position: 5,
            name: 'Transcribe',
            text: 'Click "Load Model & Transcribe". The model downloads once and is cached for future use.',
            url,
          },
          {
            '@type': 'HowToStep',
            position: 6,
            name: 'Copy your transcript',
            text: 'Your timestamped transcript appears instantly. Copy it with one click.',
            url,
          },
        ],
      },
      {
        '@type': 'FAQPage',
        '@id': `${url}/#faq`,
        inLanguage: lang,
        mainEntity: dict.faq.items.map((item) => ({
          '@type': 'Question',
          name: item.question,
          acceptedAnswer: {
            '@type': 'Answer',
            text: item.answer,
          },
        })),
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
            name: dictPages['/tools/transcribe'] || 'Audio Transcription',
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
          <TranscribeClient dict={dict} lang={lang} />

          {/* Server-rendered FAQ — crawlable without JavaScript */}
          <section
            aria-labelledby="faq-heading"
            className="mt-16 border-t border-border/50 pt-12"
            id="faq"
          >
            <h2
              className="mb-8 font-semibold text-foreground text-xl"
              id="faq-heading"
            >
              {dict.faq.title}
            </h2>
            <dl className="space-y-6">
              {dict.faq.items.map((item) => (
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

          <footer className="mt-12 text-center text-muted-foreground text-sm">
            <p>
              {dict.footer.poweredBy}{' '}
              <a
                className="font-semibold text-foreground transition-colors hover:text-primary"
                href="https://huggingface.co/docs/transformers.js"
                rel="noopener noreferrer"
                target="_blank"
              >
                {dict.footer.transformersJs}
              </a>{' '}
              &bull;{' '}
              <a
                className="font-semibold text-foreground transition-colors hover:text-primary"
                href="https://openai.com/index/whisper/"
                rel="noopener noreferrer"
                target="_blank"
              >
                {dict.footer.whisper}
              </a>{' '}
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
