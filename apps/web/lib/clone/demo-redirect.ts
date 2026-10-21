import { CLONE_DEMO_TAKES, CLONE_DEMO_VOICES } from '@/data/clone-demo-config';

/** Only the six prepared demo selections can be carried through signup. */
export function getCloneDemoRedirect(path: unknown): string | null {
  if (typeof path !== 'string') return null;
  const match = path.match(
    /^(\/(?:en|es|de|da|it|fr)\/dashboard\/clone)\?([^#]*)$/,
  );
  if (!match) return null;
  const params = new URLSearchParams(match[2]);
  const voice = CLONE_DEMO_VOICES.find(({ id }) => id === params.get('demo'));
  const take = CLONE_DEMO_TAKES.find(({ id }) => id === params.get('take'));
  if (!(voice && take)) return null;
  return `${match[1]}?demo=${voice.id}&take=${take.id}`;
}
