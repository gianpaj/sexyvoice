import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  claims: vi.fn(),
  owned: vi.fn(),
  sample: vi.fn(),
}));
vi.mock(
  'next/server',
  async (importOriginal) =>
    await importOriginal<typeof import('next/server')>(),
);
vi.mock('@/lib/supabase/auth', () => ({ getVerifiedClaims: mocks.claims }));
vi.mock('@/lib/supabase/server', () => ({ createClient: () => ({}) }));
vi.mock('@/lib/supabase/call-voices', () => ({
  getOwnedCallVoice: mocks.owned,
}));
vi.mock('@/lib/clone/mistral', () => ({
  getMistralClient: () => ({
    audio: { voices: { getSampleAudio: mocks.sample } },
  }),
}));

import { GET } from '@/app/api/audio-references/[id]/sample/route';

const id = '11111111-1111-4111-8111-111111111111';
const request = (voiceId = id) =>
  GET(new Request('http://localhost/sample'), {
    params: Promise.resolve({ id: voiceId }),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.claims.mockResolvedValue({ sub: 'owner' });
  mocks.owned.mockResolvedValue(null);
});
describe('saved voice sample', () => {
  it('requires authentication', async () => {
    mocks.claims.mockResolvedValue(null);
    expect((await request()).status).toBe(401);
    expect(mocks.owned).not.toHaveBeenCalled();
  });
  it('rejects invalid or inaccessible references before contacting Mistral', async () => {
    expect((await request('invalid')).status).toBe(400);
    expect((await request()).status).toBe(404);
    expect(mocks.sample).not.toHaveBeenCalled();
    expect(mocks.owned).toHaveBeenCalledWith(id, 'owner');
  });
  it('proxies the owner sample privately without exposing its provider ID', async () => {
    mocks.owned.mockResolvedValue({ voice_id: 'provider-id' });
    mocks.sample.mockResolvedValue(
      Buffer.from('RIFFsample').toString('base64'),
    );
    const response = await request();
    expect(await response.text()).toBe('RIFFsample');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(mocks.sample).toHaveBeenCalledWith({ voiceId: 'provider-id' });
  });
});
