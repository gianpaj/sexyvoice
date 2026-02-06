// biome-ignore lint/style/noEnum: grand
export enum VoiceId {
  ARA = 'Ara',
  REX = 'Rex',
  SAL = 'Sal',
  EVE = 'Eve',
  LEO = 'Leo',
  // Voices not yet available - uncomment when supported:
  // ANI = "Ani",
  // MIKA = "Mika",
  // VALENTINE = "Valentine",
  // GORK = "Gork",
}

export interface Voice {
  id: VoiceId;
  uuid: string;
  name: string;
  type: string;
  tone: string;
  description: string;
  audioSampleUrl: string;
}

export const voicesData: Record<VoiceId, Voice> = {
  [VoiceId.ARA]: {
    id: VoiceId.ARA,
    uuid: '76071f55-b9d5-4852-a96e-dbadb7b93e9e',
    name: 'Ara',
    type: 'Female',
    tone: 'Warm, friendly',
    description: 'Default voice, balanced and conversational',
    audioSampleUrl: 'https://files.sexyvoice.ai/ara.mp3',
  },
  [VoiceId.REX]: {
    id: VoiceId.REX,
    uuid: 'e580b7f2-1d13-4442-af3e-b1515425de47',
    name: 'Rex',
    type: 'Male',
    tone: 'Confident, clear',
    description: 'Professional and articulate, ideal for business applications',
    audioSampleUrl: 'https://data.x.ai/audio-samples/voice_rex.mp3',
  },
  [VoiceId.SAL]: {
    id: VoiceId.SAL,
    uuid: '0d2f2652-858a-430e-8a4f-ce4b6c624474',
    name: 'Sal',
    type: 'Neutral',
    tone: 'Smooth, balanced',
    description: 'Versatile voice suitable for various contexts',
    audioSampleUrl: 'https://data.x.ai/audio-samples/voice_sal.mp3',
  },
  [VoiceId.EVE]: {
    id: VoiceId.EVE,
    uuid: 'f832da16-5fe7-4823-9c99-b0f738e39b68',
    name: 'Eve',
    type: 'Female',
    tone: 'Energetic, upbeat',
    description: 'Engaging and enthusiastic, great for interactive experiences',
    audioSampleUrl: 'https://data.x.ai/audio-samples/voice_eve.mp3',
  },
  [VoiceId.LEO]: {
    id: VoiceId.LEO,
    uuid: '7a22375b-5b5c-44d7-998c-6095cf60768b',
    name: 'Leo',
    type: 'Male',
    tone: 'Authoritative, strong',
    description: 'Decisive and commanding, suitable for instructional content',
    audioSampleUrl: 'https://data.x.ai/audio-samples/voice_leo.mp3',
  },
};

export const voices: Voice[] = Object.values(voicesData);
