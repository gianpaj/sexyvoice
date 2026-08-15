import { beforeEach, describe, expect, it, vi } from 'vitest';

import { handleDeleteAccountAction } from '@/app/actions';
import { deleteFileFromR2 } from '@/lib/storage/upload';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

vi.mock('@/lib/storage/upload', () => ({
  deleteFileFromR2: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('@/lib/utils', () => ({
  encodedRedirect: vi.fn(),
}));

function createReadQuery(result: object) {
  const query = {
    eq: vi.fn(),
    select: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockResolvedValue(result);
  return query;
}

describe('account deletion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(deleteFileFromR2).mockResolvedValue(undefined);
  });

  it('uses the admin client for the user-scoped audio soft delete', async () => {
    const audioRead = createReadQuery({
      data: [{ id: 'audio-1', storage_key: 'audio/one.mp3' }],
      error: null,
    });
    const charactersRead = createReadQuery({ data: [], error: null });
    const apiKeysRead = createReadQuery({ data: [], error: null });
    const usageRead = createReadQuery({ count: 0, error: null });
    const usageDelete = {
      delete: vi.fn(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    };
    usageDelete.delete.mockReturnValue(usageDelete);

    const usageQueries = [usageRead, usageDelete];
    const sessionSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { email: 'user@example.com', id: 'user-1' } },
        }),
        signOut: vi.fn().mockResolvedValue({ error: null }),
        updateUser: vi.fn().mockResolvedValue({ error: null }),
      },
      from: vi.fn((table: string) => {
        if (table === 'audio_files') return audioRead;
        if (table === 'characters') return charactersRead;
        if (table === 'api_keys') return apiKeysRead;
        if (table === 'usage_events') return usageQueries.shift();
        throw new Error(`Unexpected table: ${table}`);
      }),
    };

    const audioUpdate = {
      eq: vi.fn(),
      select: vi.fn().mockResolvedValue({
        data: [{ id: 'audio-1' }],
        error: null,
      }),
      update: vi.fn(),
    };
    audioUpdate.eq.mockReturnValue(audioUpdate);
    audioUpdate.update.mockReturnValue(audioUpdate);
    const adminSupabase = {
      from: vi.fn().mockReturnValue(audioUpdate),
    };

    vi.mocked(createClient).mockResolvedValue(sessionSupabase as never);
    vi.mocked(createAdminClient).mockReturnValue(adminSupabase as never);

    await handleDeleteAccountAction({ lang: 'en' });

    expect(adminSupabase.from).toHaveBeenCalledWith('audio_files');
    expect(audioUpdate.update).toHaveBeenCalledWith({
      deleted_at: expect.any(String),
      status: 'deleted',
    });
    expect(audioUpdate.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(audioUpdate.select).toHaveBeenCalledWith('id');
    expect(deleteFileFromR2).toHaveBeenCalledWith('audio/one.mp3');
  });
});
