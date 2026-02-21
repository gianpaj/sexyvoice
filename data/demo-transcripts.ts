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
  transcript: DemoTranscriptSegment[];
}

// TODO: Replace placeholder transcripts with real ones after recording demo calls
export const demoCallData: Record<string, DemoCallData> = {
  ramona: {
    characterId: 'ramona',
    audioSrc: '/demo-calls/ramona.mp3',
    durationSeconds: 18,
    transcript: [
      { time: 0.5, speaker: 'agent', text: 'You are lucky I have time for you right now.' },
      { time: 3.5, speaker: 'user', text: 'Hi Ramona...' },
      { time: 5.0, speaker: 'agent', text: 'Pobrecito... you sound so nervous. Tell me, what do you want from me today?' },
      { time: 11.0, speaker: 'user', text: "I just wanted to hear your voice." },
      { time: 13.5, speaker: 'agent', text: 'Mmm... good answer, cari\u00f1o. You may continue.' },
    ],
  },
  miyu: {
    characterId: 'miyu',
    audioSrc: '/demo-calls/miyu.mp3',
    durationSeconds: 18,
    transcript: [
      { time: 0.5, speaker: 'agent', text: 'H-hello... is someone there?' },
      { time: 3.0, speaker: 'user', text: 'Hey Miyu, how are you?' },
      { time: 5.0, speaker: 'agent', text: "I'm okay... I'm just a little nervous. This is my first time talking like this..." },
      { time: 11.0, speaker: 'user', text: "Don't worry, just relax." },
      { time: 13.0, speaker: 'agent', text: 'O-okay... thank you for being so patient with me.' },
    ],
  },
  luna: {
    characterId: 'luna',
    audioSrc: '/demo-calls/luna.mp3',
    durationSeconds: 18,
    transcript: [
      { time: 0.5, speaker: 'agent', text: 'Hey baby! Ready to have some fun tonight?' },
      { time: 3.0, speaker: 'user', text: 'Hey Luna! Absolutely.' },
      { time: 4.5, speaker: 'agent', text: "That's what I like to hear! I've been thinking about you all day, you know that?" },
      { time: 10.0, speaker: 'user', text: 'Oh really? Tell me more.' },
      { time: 12.0, speaker: 'agent', text: "Mmm, where do I even start? Let's just say I have a few ideas..." },
    ],
  },
  rafal: {
    characterId: 'rafal',
    audioSrc: '/demo-calls/rafal.mp3',
    durationSeconds: 18,
    transcript: [
      { time: 0.5, speaker: 'agent', text: 'You kept me waiting. Explain yourself.' },
      { time: 4.0, speaker: 'user', text: "Sorry, I didn't mean to..." },
      { time: 6.0, speaker: 'agent', text: "Quiet. I didn't say you could speak yet." },
      { time: 10.0, speaker: 'agent', text: 'Now... take a deep breath. And listen carefully.' },
      { time: 14.5, speaker: 'user', text: 'Yes, sir.' },
      { time: 16.0, speaker: 'agent', text: 'Good boy.' },
    ],
  },
};
