/**
 * Prepared audio for the public voice cloning demo at `/[lang]/voice-cloning`.
 *
 * Nothing is generated at click time: every reachable combination of speaker,
 * language, and sentence maps to a clip produced in advance by the real Voxtral
 * pipeline and hosted on R2. `tests/demo-clone.test.ts` proves the grid is total,
 * so the widget can never reach a combination without audio.
 *
 * Speakers come from Mozilla Common Voice (CC0). Attribution is not legally
 * required, but the corpus is credited on the page.
 */

const R2_BASE = 'https://files.sexyvoice.ai/clone-demos';

export const DEMO_LANGUAGE_CODES = ['en', 'es', 'it'] as const;

export type DemoLanguageCode = (typeof DEMO_LANGUAGE_CODES)[number];

/** Used when the page locale has no prepared clips (`de`, `da`, `fr`). */
export const DEMO_FALLBACK_LANGUAGE: DemoLanguageCode = 'en';

export interface DemoCloneSpeaker {
  /** Tailwind gradient for the selected-avatar ring, e.g. 'from-red-500 to-pink-500'. */
  accent: string;
  /** Comma-separated RGB channels consumed by the avatar glow, e.g. '239, 68, 68'. */
  glowColor: string;
  id: string;
  image: string;
  name: string;
  referenceDurationSeconds: number;
  referenceSrc: string;
}

export interface DemoCloneSentence {
  id: string;
  text: Record<DemoLanguageCode, string>;
}

export interface DemoCloneClip {
  durationSeconds: number;
  src: string;
}

// TODO(step 8): replace placeholder `image`, `referenceSrc`, and durations with
// the real Common Voice assets and their `ffprobe` durations.
export const demoCloneSpeakers: readonly DemoCloneSpeaker[] = [
  {
    id: 'ava',
    name: 'Ava',
    image: `${R2_BASE}/ava.avif`,
    accent: 'from-violet-500 to-fuchsia-500',
    glowColor: '139, 92, 246',
    referenceSrc: `${R2_BASE}/ava-reference.mp3`,
    referenceDurationSeconds: 6,
  },
  {
    id: 'leo',
    name: 'Leo',
    image: `${R2_BASE}/leo.avif`,
    accent: 'from-amber-400 to-orange-500',
    glowColor: '251, 191, 36',
    referenceSrc: `${R2_BASE}/leo-reference.mp3`,
    referenceDurationSeconds: 7,
  },
];

// TODO(step 8): confirm the final sentence wording with the recorded audio.
export const demoCloneSentences: readonly DemoCloneSentence[] = [
  {
    id: 'greeting',
    text: {
      en: 'Hello, this is my voice. It only took a few seconds to clone.',
      es: 'Hola, esta es mi voz. Solo tardó unos segundos en clonarse.',
      it: 'Ciao, questa è la mia voce. Ci sono voluti solo pochi secondi.',
    },
  },
  {
    id: 'invitation',
    text: {
      en: 'Welcome to the show. Make yourself comfortable, we are about to begin.',
      es: 'Bienvenido al espectáculo. Ponte cómodo, estamos a punto de empezar.',
      it: 'Benvenuto allo spettacolo. Mettiti comodo, stiamo per cominciare.',
    },
  },
];

/** Builds the lookup key so callers never assemble it by hand. */
function clipKey(
  speakerId: string,
  languageCode: DemoLanguageCode,
  sentenceId: string,
): string {
  return `${speakerId}:${languageCode}:${sentenceId}`;
}

// TODO(step 8): replace placeholder `src` and `durationSeconds` with the real
// R2 objects and their `ffprobe` durations.
export const demoCloneClips: Readonly<Record<string, DemoCloneClip>> = {
  'ava:en:greeting': {
    src: `${R2_BASE}/ava-en-greeting.mp3`,
    durationSeconds: 6,
  },
  'ava:en:invitation': {
    src: `${R2_BASE}/ava-en-invitation.mp3`,
    durationSeconds: 6,
  },
  'ava:es:greeting': {
    src: `${R2_BASE}/ava-es-greeting.mp3`,
    durationSeconds: 6,
  },
  'ava:es:invitation': {
    src: `${R2_BASE}/ava-es-invitation.mp3`,
    durationSeconds: 6,
  },
  'ava:it:greeting': {
    src: `${R2_BASE}/ava-it-greeting.mp3`,
    durationSeconds: 6,
  },
  'ava:it:invitation': {
    src: `${R2_BASE}/ava-it-invitation.mp3`,
    durationSeconds: 6,
  },
  'leo:en:greeting': {
    src: `${R2_BASE}/leo-en-greeting.mp3`,
    durationSeconds: 7,
  },
  'leo:en:invitation': {
    src: `${R2_BASE}/leo-en-invitation.mp3`,
    durationSeconds: 7,
  },
  'leo:es:greeting': {
    src: `${R2_BASE}/leo-es-greeting.mp3`,
    durationSeconds: 7,
  },
  'leo:es:invitation': {
    src: `${R2_BASE}/leo-es-invitation.mp3`,
    durationSeconds: 7,
  },
  'leo:it:greeting': {
    src: `${R2_BASE}/leo-it-greeting.mp3`,
    durationSeconds: 7,
  },
  'leo:it:invitation': {
    src: `${R2_BASE}/leo-it-invitation.mp3`,
    durationSeconds: 7,
  },
};

export function getDemoCloneClip(
  speakerId: string,
  languageCode: DemoLanguageCode,
  sentenceId: string,
): DemoCloneClip | undefined {
  return demoCloneClips[clipKey(speakerId, languageCode, sentenceId)];
}

export function getDemoCloneClipKey(
  speakerId: string,
  languageCode: DemoLanguageCode,
  sentenceId: string,
): string {
  return clipKey(speakerId, languageCode, sentenceId);
}

export function isDemoLanguageCode(code: string): code is DemoLanguageCode {
  return (DEMO_LANGUAGE_CODES as readonly string[]).includes(code);
}

/**
 * The demo grid covers three of the six website locales. A visitor on `/de`,
 * `/da`, or `/fr` gets English rather than an empty widget.
 */
export function resolveInitialDemoLanguage(
  pageLocale: string,
): DemoLanguageCode {
  return isDemoLanguageCode(pageLocale) ? pageLocale : DEMO_FALLBACK_LANGUAGE;
}
