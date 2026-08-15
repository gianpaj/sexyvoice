import { captureException } from '@sentry/nextjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  handleDeleteAction,
  handleDeleteAllAction,
} from '@/app/[lang]/(dashboard)/dashboard/history/actions';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  redisDel: vi.fn(),
}));

vi.mock('next/server', () => ({
  after: mocks.after,
}));

vi.mock('@upstash/redis', () => ({
  Redis: {
    fromEnv: vi.fn(() => ({ del: mocks.redisDel })),
  },
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

interface AudioFileRow {
  id: string;
  storage_key: string;
}

function createSupabaseMock({
  deletedAudioFiles = [],
  error = null,
  user = { email: 'user@example.com', id: 'user-1' },
}: {
  deletedAudioFiles?: AudioFileRow[];
  error?: Error | null;
  user?: { email: string; id: string } | null;
}) {
  const query = {
    eq: vi.fn(),
    select: vi.fn().mockResolvedValue({ data: deletedAudioFiles, error }),
    update: vi.fn(),
  };
  query.eq.mockReturnValue(query);
  query.update.mockReturnValue(query);

  const sessionSupabase = {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
    },
  };
  const adminSupabase = {
    from: vi.fn().mockReturnValue(query),
  };

  return { adminSupabase, query, sessionSupabase };
}

describe('history deletion actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.redisDel.mockResolvedValue(0);
  });

  it('soft-deletes every active audio file owned by the user', async () => {
    const deletedAudioFiles = [
      { id: 'audio-1', storage_key: 'audio/one.mp3' },
      { id: 'audio-2', storage_key: 'audio/two.mp3' },
    ];
    const { adminSupabase, query, sessionSupabase } = createSupabaseMock({
      deletedAudioFiles,
    });
    vi.mocked(createClient).mockResolvedValue(sessionSupabase as never);
    vi.mocked(createAdminClient).mockReturnValue(adminSupabase as never);

    await expect(handleDeleteAllAction()).resolves.toEqual({
      deletedCount: 2,
      success: true,
    });

    expect(adminSupabase.from).toHaveBeenCalledWith('audio_files');
    expect(query.update).toHaveBeenCalledWith({
      deleted_at: expect.any(String),
      status: 'deleted',
    });
    expect(query.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(query.eq).toHaveBeenCalledWith('status', 'active');
    expect(query.eq).not.toHaveBeenCalledWith('id', expect.any(String));
    expect(query.select).toHaveBeenCalledWith('id, storage_key');
    expect(mocks.redisDel).toHaveBeenCalledWith(
      'audio/one.mp3',
      'audio/two.mp3',
    );
    expect(mocks.after).toHaveBeenCalledOnce();
  });

  it('keeps single-file deletion scoped to the requested file', async () => {
    const { adminSupabase, query, sessionSupabase } = createSupabaseMock({
      deletedAudioFiles: [{ id: 'audio-1', storage_key: 'audio/one.mp3' }],
    });
    vi.mocked(createClient).mockResolvedValue(sessionSupabase as never);
    vi.mocked(createAdminClient).mockReturnValue(adminSupabase as never);

    await handleDeleteAction('audio-1');

    expect(query.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(query.eq).toHaveBeenCalledWith('id', 'audio-1');
  });

  it('rejects an empty single-file ID before accessing the database', async () => {
    await expect(handleDeleteAction('')).rejects.toThrow(
      'Audio file not found or unauthorized',
    );

    expect(createClient).not.toHaveBeenCalled();
    expect(mocks.redisDel).not.toHaveBeenCalled();
  });

  it('does not access audio files without an authenticated user', async () => {
    const { sessionSupabase } = createSupabaseMock({ user: null });
    vi.mocked(createClient).mockResolvedValue(sessionSupabase as never);

    await expect(handleDeleteAllAction()).rejects.toThrow('User not found');

    expect(createAdminClient).not.toHaveBeenCalled();
    expect(mocks.redisDel).not.toHaveBeenCalled();
  });

  it('does not turn a completed soft delete into a failure when Redis is down', async () => {
    const cacheError = new Error('Redis unavailable');
    const { adminSupabase, sessionSupabase } = createSupabaseMock({
      deletedAudioFiles: [{ id: 'audio-1', storage_key: 'audio/one.mp3' }],
    });
    vi.mocked(createClient).mockResolvedValue(sessionSupabase as never);
    vi.mocked(createAdminClient).mockReturnValue(adminSupabase as never);
    mocks.redisDel.mockRejectedValue(cacheError);

    await expect(handleDeleteAllAction()).resolves.toEqual({
      deletedCount: 1,
      success: true,
    });

    expect(captureException).toHaveBeenCalledWith(
      cacheError,
      expect.objectContaining({ level: 'warning' }),
    );
  });
});
