import assetManifest from './clone-demo-assets.json';
import {
  CLONE_DEMO_TAKES,
  CLONE_DEMO_VOICES,
  type CloneDemoTakeId,
  getCloneDemoPrompt,
} from './clone-demo-config';

export type { CloneDemoTakeId } from './clone-demo-config';
export { CLONE_DEMO_TAKES } from './clone-demo-config';

export const DEMO_LANGUAGE_CODES = ['en', 'de'] as const;
export type DemoLanguageCode = (typeof DEMO_LANGUAGE_CODES)[number];
export const DEMO_FALLBACK_LANGUAGE: DemoLanguageCode = 'en';

export interface DemoCloneClip {
  durationSeconds: number;
  src: string;
}

export interface DemoCloneTake extends DemoCloneClip {
  id: CloneDemoTakeId;
  prompt: string;
}

export interface DemoCloneSpeaker {
  id: string;
  image: string;
  languageCode: DemoLanguageCode;
  name: string;
  reference: DemoCloneClip;
  script: string;
  takes: readonly DemoCloneTake[];
}

const assets: Record<string, { durationSeconds: number }> =
  assetManifest.assets;

function getClip(filename: string): DemoCloneClip {
  const asset = assets[filename];
  if (!asset) throw new Error(`Missing clone demo asset: ${filename}`);
  return {
    durationSeconds: asset.durationSeconds,
    src: `/demo-clones/voxtral-3/${filename}`,
  };
}

/** Two reference voices, each speaking the same sentence in three prepared takes. */
export const demoCloneSpeakers: readonly DemoCloneSpeaker[] =
  CLONE_DEMO_VOICES.map((voice) => ({
    id: voice.id,
    image: voice.image,
    languageCode: voice.languageCode,
    name: voice.name,
    script: voice.sentence,
    reference: getClip(`${voice.id}-reference.mp3`),
    takes: CLONE_DEMO_TAKES.map((take) => ({
      id: take.id,
      prompt: getCloneDemoPrompt(voice.sentence, take.id),
      ...getClip(`${voice.id}-${take.id}.mp3`),
    })),
  }));

export function getDemoCloneSpeaker(speakerId: string): DemoCloneSpeaker {
  return (
    demoCloneSpeakers.find((speaker) => speaker.id === speakerId) ??
    demoCloneSpeakers[0]
  );
}

export function getDemoCloneSelection(
  speakerId: string | null,
  takeId: string | null,
) {
  const speaker = demoCloneSpeakers.find((speaker) => speaker.id === speakerId);
  const take = speaker?.takes.find((take) => take.id === takeId);
  return speaker && take ? { speaker, take } : null;
}

export function getDemoCloneTranscript(script: string): string {
  return script.replace(/\s*\[[^\]]*\]\s*/g, ' ').trim();
}

export function isDemoLanguageCode(code: string): code is DemoLanguageCode {
  return (DEMO_LANGUAGE_CODES as readonly string[]).includes(code);
}

export function resolveInitialDemoSpeakerId(pageLocale: string): string {
  return (
    demoCloneSpeakers.find((speaker) => speaker.languageCode === pageLocale) ??
    demoCloneSpeakers[0]
  ).id;
}
