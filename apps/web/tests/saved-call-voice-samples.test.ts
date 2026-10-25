import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ insert: vi.fn(), single: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ from: () => ({ insert: mocks.insert }) }),
}));

import { saveCallVoiceProfile } from '@/lib/clone/save-call-voice-profile';
import { mockDeleteFileFromR2, mockUploadFileToR2 } from './setup';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.insert.mockReturnValue({ select: () => ({ single: mocks.single }) });
  mocks.single.mockResolvedValue({ data: { id: 'reference' }, error: null });
});

const save = (generateSample: () => Promise<Buffer>, deleteVoice = vi.fn()) =>
  saveCallVoiceProfile({
    voiceId: 'provider-voice',
    name: 'Mine',
    locale: 'en',
    userId: 'owner',
    provider: 'inworld',
    generateSample,
    deleteVoice,
  });

describe('stored call voice samples', () => {
  it('uploads before saving the URL on the matching owned voice profile', async () => {
    await save(async () => Buffer.from('RIFFsample'));
    const row = mocks.insert.mock.calls[0][0];
    const key = mockUploadFileToR2.mock.calls[0][0];
    expect(key).toMatch(
      new RegExp(`^call-voice-samples/${row.id}/[0-9a-f-]+\\.wav$`),
    );
    expect(row.sample_url).toBe(`https://files.sexyvoice.ai/${key}`);
    expect(row.user_id).toBe('owner');
    expect(mockUploadFileToR2.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.insert.mock.invocationCallOrder[0],
    );
  });

  it('rejects empty samples before uploading or saving a profile', async () => {
    const deleteVoice = vi.fn();
    await expect(
      save(async () => Buffer.alloc(0), deleteVoice),
    ).rejects.toThrow('Voice sample is empty');
    expect(mockUploadFileToR2).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(deleteVoice).toHaveBeenCalledOnce();
  });

  it('cleans up an attempted upload and the provider voice if R2 fails', async () => {
    const deleteVoice = vi.fn();
    mockUploadFileToR2.mockRejectedValueOnce(new Error('Upload failed'));
    await expect(
      save(async () => Buffer.from('RIFFsample'), deleteVoice),
    ).rejects.toThrow('Upload failed');
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mockDeleteFileFromR2).toHaveBeenCalledWith(
      mockUploadFileToR2.mock.calls[0][0],
    );
    expect(deleteVoice).toHaveBeenCalledOnce();
  });

  it('attempts both cleanups and preserves the save error when R2 deletion fails', async () => {
    const deleteVoice = vi.fn();
    mocks.single.mockResolvedValue({
      data: null,
      error: new Error('Save failed'),
    });
    mockDeleteFileFromR2.mockRejectedValueOnce(new Error('Cleanup failed'));
    await expect(
      save(async () => Buffer.from('RIFFsample'), deleteVoice),
    ).rejects.toThrow('Save failed');
    expect(deleteVoice).toHaveBeenCalledOnce();
  });
});
