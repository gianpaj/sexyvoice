import assetManifest from './clone-demo-assets.json';
import {
  CLONE_DEMO_VOICES,
  type CloneDemoTakeId,
  getCloneDemoPrompt,
  getCloneDemoTakes,
} from './clone-demo-config';
import {
  CLONE_DEMO_LANGUAGES,
  type DemoLanguageCode,
  resolveInitialDemoLanguageCode,
} from './clone-demo-languages';

export type { CloneDemoTakeId } from './clone-demo-config';
export { CLONE_DEMO_TAKES } from './clone-demo-config';
export type { DemoLanguageCode } from './clone-demo-languages';
export {
  DEMO_FALLBACK_LANGUAGE,
  DEMO_LANGUAGE_CODES,
  isDemoLanguageCode,
  resolveInitialDemoLanguageCode,
} from './clone-demo-languages';

export interface DemoCloneClip {
  durationSeconds: number;
  peaks: number[][];
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

export interface DemoCloneLanguage {
  languageCode: DemoLanguageCode;
  /** Staged text, not the transcript of any ready audio. */
  prompt: string;
  speaker: DemoCloneSpeaker | null;
}

type DemoCloneAsset =
  (typeof assetManifest.assets)[keyof typeof assetManifest.assets];

const assets: Record<string, DemoCloneAsset> = assetManifest.assets;

function getClip(filename: string): DemoCloneClip {
  const asset = assets[filename];
  if (!asset) throw new Error(`Missing clone demo asset: ${filename}`);
  if (asset.waveform?.sourceSha256 !== asset.sha256) {
    throw new Error(
      `Missing or stale clone demo waveform: ${filename}. Run pnpm generate-audio-waveforms.`,
    );
  }
  return {
    durationSeconds: asset.durationSeconds,
    peaks: asset.waveform.peaks,
    src: `/demo-clones/voxtral-3/${filename}`,
  };
}

/** Prepared deliveries and same-text comparisons for the reference voices. */
export const demoCloneSpeakers: readonly DemoCloneSpeaker[] =
  CLONE_DEMO_VOICES.map((voice) => ({
    id: voice.id,
    image: voice.image,
    languageCode: voice.languageCode,
    name: voice.name,
    script: voice.sentence,
    reference: getClip(`${voice.id}-reference.mp3`),
    takes: getCloneDemoTakes(voice).map((take) => ({
      id: take.id,
      prompt: getCloneDemoPrompt(voice, take.id),
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
  return script.replace(/\[[^\]]*\]/g, '').trim();
}

export function getDemoCloneLanguages(locale: string): DemoCloneLanguage[] {
  const initialLanguage = resolveInitialDemoLanguageCode(locale);
  const languages = CLONE_DEMO_LANGUAGES.map((language) => ({
    ...language,
    speaker:
      demoCloneSpeakers.find(
        (speaker) => speaker.languageCode === language.languageCode,
      ) ?? null,
  }));
  return [
    ...languages.filter(({ languageCode }) => languageCode === initialLanguage),
    ...languages.filter(({ languageCode }) => languageCode !== initialLanguage),
  ];
}

export function resolveInitialDemoSpeakerId(pageLocale: string): string {
  return (
    demoCloneSpeakers.find((speaker) => speaker.languageCode === pageLocale) ??
    demoCloneSpeakers[0]
  ).id;
}
