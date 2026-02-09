import Link from 'next/link';

import { HeaderStatic } from '@/components/header-static';
import { getDictionary } from '@/lib/i18n/get-dictionary';
import type { Locale } from '@/lib/i18n/i18n-config';
import AudioConverterClient from './audio-converter.client';

interface Props {
  params: Promise<{ lang: Locale }>;
}

export default async function AudioConverterPage({ params }: Props) {
  const { lang } = await params;
  const dict = await getDictionary(lang, 'audioConverter');
  const dictHeader = await getDictionary(lang, 'header');

  return (
    <div className="min-h-screen bg-background">
      <HeaderStatic dict={dictHeader} lang={lang} />
      <div className="container mx-auto max-w-3xl px-4 pt-20 pb-12 md:pt-32 md:pb-20">
        <AudioConverterClient dict={dict} />
        <footer className="mt-12 text-center text-muted-foreground text-sm">
          <p>
            {dict.footer.poweredBy}{' '}
            <span className="font-semibold text-foreground">
              {dict.footer.ffmpeg}
            </span>{' '}
            • {dict.footer.noUploads}
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
