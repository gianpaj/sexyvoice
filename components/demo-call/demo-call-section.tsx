import { getDictionary } from '@/lib/i18n/get-dictionary';
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
  const dict = await getDictionary(lang, 'landing');

  return (
    <section className="mx-auto w-full max-w-lg py-4">
      <DemoCallPlayer
        pickCharacterLabel={dict.demoCall.pickCharacter}
        playLabel={dict.demoCall.playButton}
        stopLabel={dict.demoCall.stopButton}
      />
    </section>
  );
}
