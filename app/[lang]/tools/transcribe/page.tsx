import type { Metadata } from 'next';
import Link from 'next/link';

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
          `https://sexyvoice.ai/${locale}/tools/transcribe`,
        ]),
      ),
    },
  };
}

export default async function TranscribePage({ params }: Props) {
  const { lang } = await params;
  const dict = await getDictionary(lang, 'transcribe');
  const dictHeader = await getDictionary(lang, 'header');

  return (
    <div className="min-h-screen bg-background">
      <HeaderStatic dict={dictHeader} lang={lang} />
      <div className="container mx-auto max-w-3xl px-4 py-12 md:py-20">
        <TranscribeClient dict={dict} lang={lang} />
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
  );
}
