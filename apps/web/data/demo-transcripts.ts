import type { TranscriptionResult } from '@/app/[lang]/tools/transcribe/hooks/use-transcriber';

interface DemoCallData {
  audioSrc: string;
  characterId: string;
  durationSeconds: number;
  transcript: TranscriptionResult | null;
}

// TODO: Replace placeholder transcripts with real ones after recording demo calls
export const demoCallData: Record<string, DemoCallData> = {
  lily: {
    // audioSrc: '/demo-calls/lily.mp3',
    audioSrc: 'https://files.sexyvoice.ai/call-demos/lily.mp3',
    characterId: 'lily',
    durationSeconds: 11.9,
    transcript: {
      chunks: [
        {
          text: 'Hi... um, sorry to bother you...',
          timestamp: [0, 2],
        },
        {
          text: "I just... I didn't know who else to call. Are you... busy?",
          timestamp: [2, 6],
        },
        {
          text: 'I was hoping maybe you could help me study a little... or something.',
          timestamp: [6, null],
        },
      ],
      text: 'agent',
    },
  },
  rafal: {
    // audioSrc: '/demo-calls/rafal.mp3',
    audioSrc: 'https://files.sexyvoice.ai/call-demos/rafal.mp3',
    characterId: 'rafal',
    durationSeconds: 18.84,
    transcript: {
      chunks: [
        {
          text: 'Hey there, boy. Come closer. ',
          timestamp: [0, 2.5],
        },
        {
          text: "I've been waiting to hear that voice of yours.",
          timestamp: [2.5, 5],
        },
        {
          text: 'Tell me what you need from Daddy right now.',
          timestamp: [5, null],
        },
      ],
      text: 'agent',
    },
  },
  ramona: {
    // audioSrc: '/demo-calls/ramona.mp3',
    audioSrc: 'https://files.sexyvoice.ai/call-demos/ramona.mp3',
    characterId: 'ramona',
    durationSeconds: 7.85,
    transcript: {
      chunks: [
        {
          text: 'Hola, mi amor.',
          timestamp: [0, 1],
        },
        {
          text: 'Tell me what you crave for me tonight.',
          timestamp: [1, 3],
        },
        {
          text: "Don't keep me waiting, cariño.",
          timestamp: [3, null],
        },
      ],
      text: '_',
    },
  },
};
