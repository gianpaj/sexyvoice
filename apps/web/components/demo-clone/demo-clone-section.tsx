import { getMessages } from 'next-intl/server';

import {
  DEMO_LANGUAGE_CODES,
  type DemoLanguageCode,
  resolveInitialDemoLanguage,
} from '@/data/demo-clone';
import { getTranslatedLanguages } from '@/lib/i18n/get-translated-languages';
import type { Locale } from '@/lib/i18n/i18n-config';
import { sortByPageLocale } from '@/lib/i18n/sort-by-page-locale';
import { DemoClonePlayer } from './demo-clone-player';

interface DemoCloneSectionProps {
  lang: Locale;
}

/**
 * Server component wrapper for the voice cloning demo.
 *
 * Resolves i18n strings and the locale-aware language ordering, then hands the
 * client component plain props.
 */
export async function DemoCloneSection({ lang }: DemoCloneSectionProps) {
  const messages = (await getMessages({ locale: lang })) as IntlMessages;
  const demoClone = messages.landing.demoClone;

  const languages = sortByPageLocale(
    getTranslatedLanguages(lang, DEMO_LANGUAGE_CODES).map(
      ({ value, label }) => ({
        code: value as DemoLanguageCode,
        label,
      }),
    ),
    lang,
  );

  return (
    <section className="mx-auto w-full max-w-lg py-4">
      <DemoClonePlayer
        initialLanguageCode={resolveInitialDemoLanguage(lang)}
        labels={{
          audioError: demoClone.audioError,
          hearResult: demoClone.hearResult,
          pickLanguage: demoClone.pickLanguage,
          pickSentence: demoClone.pickSentence,
          pickSpeaker: demoClone.pickSpeaker,
          playAudio: demoClone.playAudio,
          preparedExamplesCaption: demoClone.preparedExamplesCaption,
          referenceLabel: demoClone.referenceLabel,
          resultLabel: demoClone.resultLabel,
          retry: demoClone.retry,
        }}
        languages={languages}
      />
    </section>
  );
}
