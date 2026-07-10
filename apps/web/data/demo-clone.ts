/**
 * Prepared audio for the public voice cloning demo at `/[lang]/voice-cloning`.
 *
 * Nothing is generated at click time. A speaker is a reference recording plus
 * the single clip the real cloning pipeline produced from it ahead of time, in
 * one language, and both are hosted on R2. One speaker, one language, one
 * script: `tests/demo-clone.test.ts` proves every speaker carries its own audio,
 * so the widget can never reach a selection without a clip.
 *
 * Speakers come from Mozilla Common Voice (CC0). Attribution is not legally
 * required, but the corpus is credited on the page.
 */

const R2_BASE = 'https://files.sexyvoice.ai/clone-demos';

/**
 * The languages the speakers cover, one speaker each. `tests/demo-clone.test.ts`
 * keeps this list and `demoCloneSpeakers` in sync.
 */
export const DEMO_LANGUAGE_CODES = ['en', 'de'] as const;

export type DemoLanguageCode = (typeof DEMO_LANGUAGE_CODES)[number];

/** Used when the page locale has no speaker (`es`, `it`, `da`, `fr`). */
export const DEMO_FALLBACK_LANGUAGE: DemoLanguageCode = 'en';

export interface DemoCloneClip {
  durationSeconds: number;
  src: string;
}

export interface DemoCloneSpeaker {
  /** Tailwind gradient for the selected-avatar ring, e.g. 'from-red-500 to-pink-500'. */
  accent: string;
  /** Comma-separated RGB channels consumed by the avatar glow, e.g. '239, 68, 68'. */
  glowColor: string;
  id: string;
  image: string;
  languageCode: DemoLanguageCode;
  name: string;
  /** The recording the voice was cloned from. */
  reference: DemoCloneClip;
  /** The cloned voice speaking `script`, in `languageCode`. */
  result: DemoCloneClip;
  /**
   * The prompt handed to the TTS model, `[emphasis]`-style directives included.
   * Render it through `getDemoCloneTranscript`, never raw.
   */
  script: string;
}

// TODO(step 8): replace placeholder `image` and durations with the real Common
// Voice assets and their `ffprobe` durations.
export const demoCloneSpeakers: readonly DemoCloneSpeaker[] = [
  {
    id: 'kat',
    name: 'Kat',
    image: '/demo-clones/kat.webp',
    accent: 'from-violet-500 to-fuchsia-500',
    glowColor: '139, 92, 246',
    languageCode: 'en',
    reference: {
      src: `${R2_BASE}/kat-reference.mp3`,
      durationSeconds: 30,
    },
    result: {
      src: `${R2_BASE}/inworld-tts-2_kat-downtown-drugstore-en.mp3`,
      durationSeconds: 30,
    },
    script:
      "Downtown Drugstore had a bell on the door that made a single tank sound when you opened it. Oxford Pharmacy had two bells on its doors, so it was more of a tutank, though nothing to startle over. But the Gathrite Reed Drug Company door bore a footlong strip of brass sleigh bells on its knob, which, when turned, sent metal balls [energetic] clanging to announce somebody's coming in the dang store [emphasis] so you better turn around and look see who it is.",
  },
  {
    id: 'heike',
    name: 'Heike',
    image: '/demo-clones/heike.webp',
    accent: 'from-amber-400 to-orange-500',
    glowColor: '251, 191, 36',
    languageCode: 'de',
    reference: {
      src: `${R2_BASE}/heike-reference.mp3`,
      durationSeconds: 30,
    },
    result: {
      src: `${R2_BASE}/inworld-tts-2_heike-kasse-de.mp3`,
      durationSeconds: 30,
    },
    script:
      'Der Kasse gleich rechts wollte eine kräftige Frau gerade etwas bezahlen. Es war Prip, die neue Gierigste von den vielen Freunden in meiner Schwester. Ihre Blondebrockfrisur orientiert sich an diesem feuchten September morgen [pause] mehr zu den Seiten hin als nach unten. [emphasis] Börde, ich lang nicht gesehen, sagte sie, sie bezahlt einen Parallel-Strumpfe, zwei für losgrößere, alles besseren extra',
  },
];

/** Falls back to the first speaker so an unknown id can never blank the widget. */
export function getDemoCloneSpeaker(speakerId: string): DemoCloneSpeaker {
  return (
    demoCloneSpeakers.find((speaker) => speaker.id === speakerId) ??
    demoCloneSpeakers[0]
  );
}

export function isDemoLanguageCode(code: string): code is DemoLanguageCode {
  return (DEMO_LANGUAGE_CODES as readonly string[]).includes(code);
}

/**
 * Each demo language has exactly one speaker, so the page locale chooses which
 * speaker opens selected. A visitor on a locale the demo does not cover starts
 * on the English speaker rather than on an arbitrary one.
 */
export function resolveInitialDemoSpeakerId(pageLocale: string): string {
  const forLanguage = (code: string) =>
    demoCloneSpeakers.find((speaker) => speaker.languageCode === code);

  const speaker =
    forLanguage(pageLocale) ??
    forLanguage(DEMO_FALLBACK_LANGUAGE) ??
    demoCloneSpeakers[0];

  return speaker.id;
}
