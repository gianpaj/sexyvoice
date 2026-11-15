import { describe, expect, it } from 'vitest';

import { generateHash } from '@/lib/audio';
import { dashboardSpeechKey } from '@/lib/tts/cache-key';

const base = {
  isPaidUser: false,
  provider: 'gemini',
  runtimeModel: 'gemini-3.8-flash-tts',
  text: 'Hello world',
  voiceName: 'kore',
} as const;

describe('dashboardSpeechKey', () => {
  it('keeps the original key for requests without settings', async () => {
    const hash = await generateHash('Hello world-kore-gemini-3.8-flash-tts');

    await expect(dashboardSpeechKey(base)).resolves.toBe(
      `generated-audio-free/kore-${hash}.wav`,
    );
    await expect(
      dashboardSpeechKey({ ...base, isPaidUser: true }),
    ).resolves.toBe(`generated-audio/kore-${hash}.wav`);
  });

  it('adds each provider setting to the hash', async () => {
    const hash = await generateHash(
      'Hello world-kore-gemini-3.8-flash-tts-7-temp:1.2-style:"whisper"',
    );

    await expect(
      dashboardSpeechKey({
        ...base,
        seed: 7,
        style: 'whisper',
        temperature: 1.2,
      }),
    ).resolves.toBe(`generated-audio-free/kore-${hash}.wav`);
  });

  it('stores Grok audio as mp3 and keys it by language', async () => {
    const grok = {
      ...base,
      provider: 'grok',
      runtimeModel: 'xai',
      voiceName: 'eve',
    } as const;
    const automatic = await dashboardSpeechKey(grok);
    const spanish = await dashboardSpeechKey({ ...grok, language: 'es' });

    expect(automatic).toBe(
      `generated-audio-free/eve-${await generateHash('Hello world-eve-xai')}.mp3`,
    );
    expect(spanish).not.toBe(automatic);
  });
});
