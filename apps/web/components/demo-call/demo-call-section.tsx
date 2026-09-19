import { getMessages } from 'next-intl/server';

import type { Locale } from '@/lib/i18n/i18n-config';
import { DemoCallPlayer } from './demo-call-player';

interface DemoCallSectionProps {
  lang: Locale;
}

/**
 * Server component wrapper for the demo call player.
 * Loads i18n strings and passes them to the client component.
 */
export async function DemoCallSection({ lang }: DemoCallSectionProps) {
  const messages = (await getMessages({ locale: lang })) as IntlMessages;
  const demoCall = messages.landing.demoCall;

  return (
    <section className="mx-auto w-full max-w-lg py-4">
      <DemoCallPlayer
        pickCharacterLabel={demoCall.pickCharacter}
        playLabel={demoCall.playButton}
        stopLabel={demoCall.stopButton}
      />
    </section>
  );
}
