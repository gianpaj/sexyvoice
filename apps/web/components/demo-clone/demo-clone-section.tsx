import { getMessages } from 'next-intl/server';

import {
  DEMO_LANGUAGE_CODES,
  type DemoLanguageCode,
  resolveInitialDemoSpeakerId,
} from '@/data/demo-clone';
import { getTranslatedLanguages } from '@/lib/i18n/get-translated-languages';
import type { Locale } from '@/lib/i18n/i18n-config';
import { DemoClonePlayer } from './demo-clone-player';

interface DemoCloneSectionProps {
  lang: Locale;
}

/**
 * Server component wrapper for the voice cloning demo.
 *
 * Resolves i18n strings and the localized language names, then hands the client
 * component plain props.
 */
export async function DemoCloneSection({ lang }: DemoCloneSectionProps) {
  const messages = (await getMessages({ locale: lang })) as IntlMessages;
  const demoClone = messages.landing.demoClone;

  const languageLabels = Object.fromEntries(
    getTranslatedLanguages(lang, DEMO_LANGUAGE_CODES).map(
      ({ value, label }) => [value, label],
    ),
  ) as Record<DemoLanguageCode, string>;

  return (
    <section className="mx-auto w-full max-w-lg py-4">
      <DemoClonePlayer
        initialSpeakerId={resolveInitialDemoSpeakerId(lang)}
        labels={demoClone}
        languageLabels={languageLabels}
      />
    </section>
  );
}
