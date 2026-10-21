import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  remove: vi.fn(),
  insert: vi.fn(),
  single: vi.fn(),
}));
vi.mock('@mistralai/mistralai', () => ({
  Mistral: class {
    audio = { voices: { create: mocks.create, delete: mocks.remove } };
  },
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ from: () => ({ insert: mocks.insert }) }),
}));

import { saveMistralVoice } from '@/lib/clone/mistral';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('MISTRAL_API_KEY', 'test');
  mocks.create.mockResolvedValue({ id: 'provider-voice' });
  mocks.remove.mockResolvedValue({});
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
      name: 'Mine',
      locale: 'en',
      user_id: 'owner',
      provider: 'mistral',
      voice_id: 'provider-voice',
      is_paid: true,
    });
  });

  it('removes the provider voice if the database write fails', async () => {
    const error = new Error('Insert failed');
    mocks.single.mockResolvedValue({ data: null, error });
    await expect(
      saveMistralVoice(Buffer.from('sample'), 'Mine', 'en', 'owner'),
    ).rejects.toBe(error);
    expect(mocks.remove).toHaveBeenCalledWith({ voiceId: 'provider-voice' });
  });
});
