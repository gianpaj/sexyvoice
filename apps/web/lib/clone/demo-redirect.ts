import { CLONE_DEMO_VOICES, getCloneDemoTakes } from '@/data/clone-demo-config';

/** Only prepared voice/take pairs can be carried through signup. */
export function getCloneDemoRedirect(path: unknown): string | null {
  if (typeof path !== 'string') return null;
  const match = path.match(
    /^(\/(?:en|es|de|da|it|fr)\/dashboard\/clone)\?([^#]*)$/,
  );
  if (!match) return null;
  const params = new URLSearchParams(match[2]);
  const voice = CLONE_DEMO_VOICES.find(({ id }) => id === params.get('demo'));
  if (!voice) return null;
  const take = getCloneDemoTakes(voice).find(
    ({ id }) => id === params.get('take'),
  );
  if (!take) return null;
  return `${match[1]}?demo=${voice.id}&take=${take.id}`;
}
