import { CLONE_DEMO_VOICES, getCloneDemoTakes } from '@/data/clone-demo-config';
import { i18n } from '@/lib/i18n/i18n-config';

/** Only prepared voice/take pairs can be carried through signup. */
export function getCloneDemoRedirect(path: unknown): string | null {
  if (typeof path !== 'string') return null;
  const match = path.match(/^(\/([^/]+)\/dashboard\/clone)\?([^#]*)$/);
  if (!(match && i18n.locales.some((locale) => locale === match[2])))
    return null;
  const params = new URLSearchParams(match[3]);
  const voice = CLONE_DEMO_VOICES.find(({ id }) => id === params.get('demo'));
  if (!voice) return null;
  const take = getCloneDemoTakes(voice).find(
    ({ id }) => id === params.get('take'),
  );
  if (!take) return null;
  return `${match[1]}?demo=${voice.id}&take=${take.id}`;
}
