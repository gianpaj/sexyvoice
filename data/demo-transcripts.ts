export interface DemoTranscriptSegment {
  /** Seconds from start of audio when this segment should appear */
  time: number;
  /** Who is speaking: 'agent' for the character, 'user' for the mock user */
  speaker: 'agent' | 'user';
  /** The text content of this segment */
  text: string;
}

export interface DemoCallData {
  characterId: string;
  audioSrc: string;
  durationSeconds: number;
  // transcript: DemoTranscriptSegment[];
}

// TODO: Replace placeholder transcripts with real ones after recording demo calls
export const demoCallData: Record<string, DemoCallData> = {
  ramona: {
    characterId: 'ramona',
    audioSrc: '/demo-calls/ramona.mp3',
    durationSeconds: 7.85,
  },
  miyu: {
    characterId: 'miyu',
    audioSrc: '/demo-calls/miyu.mp3',
    durationSeconds: 18.9,
  },
  luna: {
    characterId: 'luna',
    audioSrc: '/demo-calls/luna.mp3',
    durationSeconds: 11.9,
  },
  rafal: {
    characterId: 'rafal',
    audioSrc: '/demo-calls/rafal.mp3',
    durationSeconds: 18.84,
  },
};
