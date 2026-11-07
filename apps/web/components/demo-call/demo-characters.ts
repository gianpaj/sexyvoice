import type {
  TranscriptChunk,
  TranscriptionResult,
} from '@/components/transcript/transcript-display';
import { FILES_URL } from '@/lib/site';

export interface DemoCharacter {
  /** Tailwind gradient for the avatar ring. */
  accent: string;
  audioSrc: string;
  durationSeconds: number;
  /** RGB triplet for the speaking glow. */
  glowColor: string;
  id: string;
  /** File name under `/characters/`. */
  image: string;
  name: string;
  transcript: TranscriptionResult;
}

/** A transcript from timed lines of a recording. */
const transcriptOf = (chunks: TranscriptChunk[]): TranscriptionResult => ({
  chunks,
  text: chunks.map(({ text }) => text.trim()).join(' '),
});

/** Recorded sample calls on the voice-call page. The first plays by default. */
export const DEMO_CHARACTERS: readonly DemoCharacter[] = [
  {
    accent: 'from-red-500 to-pink-500',
    audioSrc: `${FILES_URL}/call-demos/ramona.mp3`,
    durationSeconds: 7.85,
    glowColor: '239, 68, 68',
    id: 'ramona',
    image: 'ramona.webp',
    name: 'Ramona',
    transcript: transcriptOf([
      { text: 'Hola, mi amor.', timestamp: [0, 1] },
      { text: 'Tell me what you crave for me tonight.', timestamp: [1, 3] },
      { text: "Don't keep me waiting, cariño.", timestamp: [3, null] },
    ]),
  },
  {
    accent: 'from-amber-400 to-orange-500',
    audioSrc: `${FILES_URL}/call-demos/lily.mp3`,
    durationSeconds: 11.9,
    glowColor: '251, 191, 36',
    id: 'lily',
    image: 'lily.webp',
    name: 'Lily',
    transcript: transcriptOf([
      { text: 'Hi... um, sorry to bother you...', timestamp: [0, 2] },
      {
        text: "I just... I didn't know who else to call. Are you... busy?",
        timestamp: [2, 6],
      },
      {
        text: 'I was hoping maybe you could help me study a little... or something.',
        timestamp: [6, null],
      },
    ]),
  },
  {
    accent: 'from-violet-500 to-fuchsia-500',
    audioSrc: `${FILES_URL}/call-demos/rafal.mp3`,
    durationSeconds: 18.84,
    glowColor: '139, 92, 246',
    id: 'rafal',
    image: 'rafal.webp',
    name: 'Rafal',
    transcript: transcriptOf([
      { text: 'Hey there, boy. Come closer. ', timestamp: [0, 2.5] },
      {
        text: "I've been waiting to hear that voice of yours.",
        timestamp: [2.5, 5],
      },
      {
        text: 'Tell me what you need from Daddy right now.',
        timestamp: [5, null],
      },
    ]),
  },
];
