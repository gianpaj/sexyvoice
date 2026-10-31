import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ insert: vi.fn(), single: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: () => ({ insert: mocks.insert }) }),
}));

import { getCallCloneProvider } from '@/lib/clone/call-clone-provider';
import { supportsCallCloneLocale } from '@/lib/clone/call-voice-config';
import {
  countInworldWorkspaceVoices,
  deleteInworldVoice,
  getInworldVoiceSample,
  saveInworldVoice,
} from '@/lib/clone/inworld';
import { saveCallVoiceProfile } from '@/lib/clone/save-call-voice-profile';
import { mockDeleteFileFromR2, mockUploadFileToR2 } from './setup';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('INWORLD_API_KEY', 'encoded-credential');
  mocks.insert.mockReturnValue({ select: () => ({ single: mocks.single }) });
  mocks.single.mockResolvedValue({
    data: { id: 'reference', provider: 'inworld' },
    error: null,
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it('treats an already deleted Inworld voice as successful cleanup', async () => {
  const request = vi
    .fn()
    .mockResolvedValue(new Response(null, { status: 404 }));
  vi.stubGlobal('fetch', request);
  await expect(deleteInworldVoice('voice/id')).resolves.toBeUndefined();
  expect(request).toHaveBeenCalledWith(
    'https://api.inworld.ai/voices/v1/voices/voice%2Fid',
    expect.objectContaining({ method: 'DELETE' }),
  );
});

it.each([
  [{ totalSize: 42 }, 42],
  [{ totalSize: '7' }, 7],
  [{}, 0],
])('counts custom workspace voices from %j', async (body, count) => {
  const request = vi.fn().mockResolvedValue(Response.json(body));
  vi.stubGlobal('fetch', request);
  await expect(countInworldWorkspaceVoices()).resolves.toBe(count);
  const url = new URL(request.mock.calls[0][0]);
  expect(url.pathname).toBe('/voices/v1/voices');
  expect(url.searchParams.get('filter')).toBe('owned = "true"');
  expect(url.searchParams.get('pageSize')).toBe('1');
});

describe('call clone provider configuration', () => {
  it('defaults to Inworld and allows Mistral for new clones', () => {
    vi.stubEnv('CALL_CLONE_PROVIDER', '');
    expect(getCallCloneProvider()).toBe('inworld');
    vi.stubEnv('CALL_CLONE_PROVIDER', 'mistral');
    expect(getCallCloneProvider()).toBe('mistral');
    expect(supportsCallCloneLocale('inworld', 'da')).toBe(true);
    expect(supportsCallCloneLocale('mistral', 'da')).toBe(false);
  });
  it('rejects invalid configuration instead of contacting another provider', () => {
    vi.stubEnv('CALL_CLONE_PROVIDER', 'typo');
    expect(getCallCloneProvider).toThrow('CALL_CLONE_PROVIDER');
  });
});

describe('Inworld saved voices', () => {
  it.each([
    ['pl', 'pl'],
    ['no', 'nb'],
    ['en-multi', 'en'],
  ])('creates and persists an owned %s clone', async (locale, languageCode) => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ voice: { voiceId: 'workspace__clone' } }),
      )
      .mockResolvedValueOnce(
        Response.json({
          audioContent: Buffer.from('RIFFsample').toString('base64'),
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    await saveInworldVoice(
      Buffer.from('reference audio'),
      'My voice',
      locale,
      'owner',
    );
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.inworld.ai/voices/v1/voices:clone');
    expect(options.headers.Authorization).toBe('Basic encoded-credential');
    expect(JSON.parse(options.body)).toEqual({
      displayName: 'My voice',
      languageCode,
      voiceSamples: [
        { audioData: Buffer.from('reference audio').toString('base64') },
      ],
    });
    expect(mocks.insert).toHaveBeenCalledWith({
      id: expect.any(String),
      name: 'My voice',
      locale,
      user_id: 'owner',
      provider: 'inworld',
      voice_id: 'workspace__clone',
      is_paid: true,
      sample_url: expect.stringMatching(
        /^https:\/\/files\.sexyvoice\.ai\/call-voice-samples\//,
      ),
    });
    const [speechUrl, speechOptions] = fetchMock.mock.calls[1];
    expect(speechUrl).toBe('https://api.inworld.ai/tts/v1/voice');
    expect(JSON.parse(speechOptions.body)).toEqual({
      text: "Hello, I'm here to guide you into a world of intimate whispers and sensual bliss.  Just relax and let my voice wrap around you.  What desire shall we explore first?",
      voiceId: 'workspace__clone',
      modelId: 'inworld-tts-2',
      audioConfig: { audioEncoding: 'LINEAR16' },
    });
    expect(mockUploadFileToR2).toHaveBeenCalledWith(
      expect.any(String),
      Buffer.from('RIFFsample'),
      'audio/wav',
    );
  });
  it('deletes a provider voice when saving its ownership record fails', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ voice: { voiceId: 'workspace__clone' } }),
      )
      .mockResolvedValueOnce(
        Response.json({
          audioContent: Buffer.from('RIFFsample').toString('base64'),
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    mocks.single.mockResolvedValue({
      data: null,
      error: new Error('database unavailable'),
    });
    await expect(
      saveInworldVoice(Buffer.from('audio'), 'My voice', 'en', 'owner'),
    ).rejects.toThrow('database unavailable');
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://api.inworld.ai/voices/v1/voices/workspace__clone',
      expect.objectContaining({ method: 'DELETE' }),
    );
    expect(mockDeleteFileFromR2).toHaveBeenCalledWith(
      mockUploadFileToR2.mock.calls[0][0],
    );
  });
  it('does not store invalid provider responses or expose their error bodies', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('private audio', { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      saveInworldVoice(Buffer.from('audio'), 'My voice', 'en', 'owner'),
    ).rejects.toThrow('Inworld voice request failed (503)');
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it('removes the cloned voice if sample synthesis fails', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ voice: { voiceId: 'workspace__clone' } }),
      )
      .mockResolvedValueOnce(
        new Response('private provider body', { status: 503 }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      saveInworldVoice(Buffer.from('audio'), 'Mine', 'en', 'owner'),
    ).rejects.toThrow('Inworld voice request failed (503)');
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://api.inworld.ai/voices/v1/voices/workspace__clone',
      expect.objectContaining({ method: 'DELETE' }),
    );
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mockUploadFileToR2).not.toHaveBeenCalled();
  });
  it('decodes a preview without exposing the provider URL to the client', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        Response.json({ audioContent: Buffer.from('mp3').toString('base64') }),
      );
    vi.stubGlobal('fetch', fetchMock);
    expect(await getInworldVoiceSample('workspace__clone')).toEqual(
      Buffer.from('mp3'),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.inworld.ai/tts/v1/voice:preview?voice_id=workspace__clone&model_id=inworld-tts-2',
      expect.objectContaining({ cache: 'no-store' }),
    );
  });
  it.each(['mistral', 'inworld'] as const)(
    'cleans up %s profiles through the shared persistence helper',
    async (provider) => {
      const deleteVoice = vi.fn();
      mocks.single.mockResolvedValue({
        data: null,
        error: new Error('database unavailable'),
      });
      await expect(
        saveCallVoiceProfile({
          voiceId: 'clone',
          name: 'My voice',
          locale: 'en',
          userId: 'owner',
          provider,
          deleteVoice,
          generateSample: async () => Buffer.from('RIFFsample'),
        }),
      ).rejects.toThrow('database unavailable');
      expect(deleteVoice).toHaveBeenCalledOnce();
    },
  );
});
