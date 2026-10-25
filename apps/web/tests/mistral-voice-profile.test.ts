import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  remove: vi.fn(),
  insert: vi.fn(),
  single: vi.fn(),
  speech: vi.fn(),
}));
vi.mock('@mistralai/mistralai', () => ({
  Mistral: class {
    audio = {
      voices: { create: mocks.create, delete: mocks.remove },
      speech: { complete: mocks.speech },
    };
  },
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ from: () => ({ insert: mocks.insert }) }),
}));

import { saveMistralVoice } from '@/lib/clone/mistral';
import { mockDeleteFileFromR2, mockUploadFileToR2 } from './setup';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('MISTRAL_API_KEY', 'test');
  mocks.create.mockResolvedValue({ id: 'provider-voice' });
  mocks.remove.mockResolvedValue({});
  mocks.speech.mockResolvedValue({
    audioData: Buffer.from('RIFFsample').toString('base64'),
  });
  mocks.insert.mockReturnValue({ select: () => ({ single: mocks.single }) });
});

describe('saved Mistral profiles', () => {
  it('stores a reusable provider voice with its owner', async () => {
    mocks.single.mockResolvedValue({
      data: { id: 'reference', name: 'Mine', locale: 'en' },
      error: null,
    });
    expect(
      await saveMistralVoice(Buffer.from('sample'), 'Mine', 'en', 'owner'),
    ).toEqual({ id: 'reference', name: 'Mine', locale: 'en' });
    expect(mocks.create).toHaveBeenCalledWith({
      name: 'Mine',
      languages: ['en'],
      sampleAudio: Buffer.from('sample').toString('base64'),
      sampleFilename: 'reference.wav',
    });
    expect(mocks.insert).toHaveBeenCalledWith({
      id: expect.any(String),
      name: 'Mine',
      locale: 'en',
      user_id: 'owner',
      provider: 'mistral',
      voice_id: 'provider-voice',
      is_paid: true,
      sample_url: expect.stringMatching(
        /^https:\/\/files\.sexyvoice\.ai\/call-voice-samples\//,
      ),
    });
    expect(mocks.speech).toHaveBeenCalledWith({
      model: 'voxtral-mini-tts-3-0',
      input:
        "Hello, I'm here to guide you into a world of intimate whispers and sensual bliss.  Just relax and let my voice wrap around you.  What desire shall we explore first?",
      voiceId: 'provider-voice',
      responseFormat: 'wav',
      stream: false,
    });
    expect(mockUploadFileToR2).toHaveBeenCalledWith(
      expect.any(String),
      Buffer.from('RIFFsample'),
      'audio/wav',
    );
  });

  it('removes the provider voice if the database write fails', async () => {
    const error = new Error('Insert failed');
    mocks.single.mockResolvedValue({ data: null, error });
    await expect(
      saveMistralVoice(Buffer.from('sample'), 'Mine', 'en', 'owner'),
    ).rejects.toBe(error);
    expect(mocks.remove).toHaveBeenCalledWith({ voiceId: 'provider-voice' });
    expect(mockDeleteFileFromR2).toHaveBeenCalledWith(
      mockUploadFileToR2.mock.calls[0][0],
    );
  });

  it('cleans up the voice without saving a profile if synthesis fails', async () => {
    mocks.speech.mockRejectedValueOnce(new Error('Speech unavailable'));
    await expect(
      saveMistralVoice(Buffer.from('sample'), 'Mine', 'en', 'owner'),
    ).rejects.toThrow('Speech unavailable');
    expect(mocks.remove).toHaveBeenCalledWith({ voiceId: 'provider-voice' });
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mockUploadFileToR2).not.toHaveBeenCalled();
  });
});
