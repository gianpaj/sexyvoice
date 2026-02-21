import Link from 'next/link';

import { HeaderStatic } from '@/components/header-static';
import { getDictionary } from '@/lib/i18n/get-dictionary';
import type { Locale } from '@/lib/i18n/i18n-config';
import TranscribeClient from './transcribe.client';

interface Props {
  params: Promise<{ lang: Locale }>;
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
