import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  claims: vi.fn(),
  deleteInworld: vi.fn(),
  deleteMistral: vi.fn(),
  owned: vi.fn(),
  rowDelete: vi.fn(),
}));
vi.mock(
  'next/server',
  async (importOriginal) =>
    await importOriginal<typeof import('next/server')>(),
);
vi.mock('@/lib/supabase/auth', () => ({ getVerifiedClaims: mocks.claims }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    from: () => ({
      delete: () => ({
        eq: (column: string, value: string) => ({
          eq: (column2: string, value2: string) =>
            mocks.rowDelete({ [column]: value, [column2]: value2 }),
        }),
      }),
    }),
  }),
}));
vi.mock('@/lib/supabase/call-voices', () => ({
  getOwnedCallVoice: mocks.owned,
}));
vi.mock('@/lib/clone/inworld', () => ({
  deleteInworldVoice: mocks.deleteInworld,
}));
vi.mock('@/lib/clone/mistral', () => ({
  deleteMistralVoice: mocks.deleteMistral,
}));

import { DELETE } from '@/app/api/audio-references/[id]/route';
import { mockDeleteFileFromR2 } from './setup';

const id = '11111111-1111-4111-8111-111111111111';
const request = (voiceId = id) =>
  DELETE(new Request('http://localhost/api/audio-references', {}), {
    params: Promise.resolve({ id: voiceId }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.claims.mockResolvedValue({ sub: 'owner' });
  mocks.owned.mockResolvedValue({
    id,
    provider: 'inworld',
    sample_url: `https://files.sexyvoice.ai/call-voice-samples/${id}/22222222-2222-4222-8222-222222222222.wav`,
    voice_id: 'workspace__clone',
  });
  mocks.rowDelete.mockResolvedValue({ error: null });
});

describe('DELETE /api/audio-references/[id]', () => {
  it('requires authentication and a valid owned voice', async () => {
    mocks.claims.mockResolvedValueOnce(null);
    expect((await request()).status).toBe(401);
    expect((await request('invalid')).status).toBe(400);
    mocks.owned.mockResolvedValueOnce(null);
    expect((await request()).status).toBe(404);
    expect(mocks.owned).toHaveBeenLastCalledWith(id, 'owner');
    expect(mocks.deleteInworld).not.toHaveBeenCalled();
    expect(mocks.rowDelete).not.toHaveBeenCalled();
  });

  it('deletes the provider voice, its sample and the owned row', async () => {
    const response = await request();

    expect(response.status).toBe(200);
    expect(mocks.deleteInworld).toHaveBeenCalledWith('workspace__clone');
    expect(mockDeleteFileFromR2).toHaveBeenCalledOnce();
    expect(mocks.rowDelete).toHaveBeenCalledWith({ id, user_id: 'owner' });
  });

  it('keeps the row when the provider deletion fails', async () => {
    mocks.owned.mockResolvedValueOnce({
      id,
      provider: 'mistral',
      sample_url: null,
      voice_id: 'mistral-voice',
    });
    mocks.deleteMistral.mockRejectedValueOnce(new Error('Mistral is down'));

    const response = await request();

    expect(response.status).toBe(502);
    expect(mocks.deleteMistral).toHaveBeenCalledWith('mistral-voice');
    expect(mocks.rowDelete).not.toHaveBeenCalled();
  });
});
