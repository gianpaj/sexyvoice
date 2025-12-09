import { getDictionary } from '@/lib/i18n/get-dictionary';
import type { Locale } from '@/lib/i18n/i18n-config';
import AudioConverterClient from './audio-converter.client';

interface Props {
  params: Promise<{ lang: Locale }>;
}

export default async function AudioConverterPage({ params }: Props) {
  const { lang } = await params;
  const dict = await getDictionary(lang, 'audioConverter');

  return <AudioConverterClient dict={dict} lang={lang} />;
}
