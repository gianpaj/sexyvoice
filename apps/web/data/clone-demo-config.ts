export const CLONE_DEMO_MODEL = 'voxtral-mini-tts-3-0';

export const CLONE_DEMO_TAKES = [
  { id: 'natural', tags: [] },
  { id: 'sarcastic', tags: ['[emotion=sarcastic]'] },
  { id: 'calmSlow', tags: ['[emotion=calm]', '[pace=slow]'] },
] as const;

export type CloneDemoTakeId = (typeof CLONE_DEMO_TAKES)[number]['id'];

export const CLONE_DEMO_VOICES = [
  {
    id: 'kat',
    name: 'Kat',
    image: '/demo-clones/kat.webp',
    languageCode: 'en',
    sentence: "Oh, you're here just when I was thinking about you.",
    prompts: {
      calmSlow:
        "Oh, [emotion=calm][pace=slow]you're here just when I was thinking about you.",
    },
    sourceKey: 'clone-demos/kat-reference.mp3',
  },
  {
    id: 'heike',
    name: 'Heike',
    image: '/demo-clones/heike.webp',
    languageCode: 'de',
    sentence: 'Ach, da bist du ja genau im richtigen Moment.',
    sourceKey: 'clone-demos/heike-reference.mp3',
  },
] as const;

export function getCloneDemoPrompt(
  voice: (typeof CLONE_DEMO_VOICES)[number],
  takeId: CloneDemoTakeId,
): string {
  const take = CLONE_DEMO_TAKES.find((take) => take.id === takeId)!;
  const prompts: Partial<Record<CloneDemoTakeId, string>> =
    'prompts' in voice ? voice.prompts : {};
  return (
    prompts[takeId] ??
    `${take.tags.join('')}${take.tags.length ? ' ' : ''}${voice.sentence}`
  );
}
