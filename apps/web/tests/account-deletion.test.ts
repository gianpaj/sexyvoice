import { captureException, logger } from '@sentry/nextjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { handleDeleteAccountAction } from '@/app/actions';
import { deleteFileFromR2 } from '@/lib/storage/upload';
import { hasOngoingSubscription } from '@/lib/stripe/stripe-admin';
import { createAdminClient } from '@/lib/supabase/admin';
import { getUserByIdWithError } from '@/lib/supabase/queries';
import { createClient } from '@/lib/supabase/server';
import { encodedRedirect } from '@/lib/utils';

vi.mock('@/lib/storage/upload', () => ({
  deleteFileFromR2: vi.fn(),
}));

vi.mock('@/lib/stripe/stripe-admin', () => ({
  hasOngoingSubscription: vi.fn(),
}));

vi.mock('@/lib/supabase/queries', () => ({
  getUserByIdWithError: vi.fn(),
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

function setupAccountDeletion({
  usageResult = { count: 3, error: null },
}: {
  usageResult?: { count: number | null; error: Error | null };
} = {}) {
  const audioRead = createReadQuery({
    data: [{ id: 'audio-1', storage_key: 'audio/one.mp3' }],
    error: null,
  });
  const charactersRead = createReadQuery({ data: [], error: null });
  const apiKeysRead = createReadQuery({ data: [], error: null });
  const usageRead = createReadQuery(usageResult);
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
      if (table === 'usage_events') return usageRead;
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

  return { adminSupabase, audioUpdate, sessionSupabase };
}

describe('account deletion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(deleteFileFromR2).mockResolvedValue(undefined);
    vi.mocked(getUserByIdWithError).mockResolvedValue({
      data: { stripe_id: 'cus_123' },
      error: null,
    } as never);
    vi.mocked(hasOngoingSubscription).mockResolvedValue(false);
  });

  it('blocks subscribers before any account or file changes', async () => {
    const { sessionSupabase } = setupAccountDeletion();
    vi.mocked(hasOngoingSubscription).mockResolvedValue(true);

    await expect(handleDeleteAccountAction({ lang: 'en' })).resolves.toEqual({
      error: 'subscriptionExists',
    });

    expect(getUserByIdWithError).toHaveBeenCalledWith('user-1');
    expect(hasOngoingSubscription).toHaveBeenCalledWith('cus_123');
    expect(sessionSupabase.auth.updateUser).not.toHaveBeenCalled();
    expect(sessionSupabase.from).not.toHaveBeenCalled();
    expect(deleteFileFromR2).not.toHaveBeenCalled();
    expect(createAdminClient).not.toHaveBeenCalled();
    expect(sessionSupabase.auth.signOut).not.toHaveBeenCalled();
    expect(encodedRedirect).not.toHaveBeenCalled();
  });

  it.each(['profile error', 'missing profile', 'Stripe error'])(
    'blocks deletion when the subscription check fails with %s',
    async (failure) => {
      const { sessionSupabase } = setupAccountDeletion();
      const error = new Error('Lookup failed');
      if (failure === 'Stripe error') {
        vi.mocked(hasOngoingSubscription).mockRejectedValueOnce(error);
      } else {
        vi.mocked(getUserByIdWithError).mockResolvedValueOnce({
          data: null,
          error: failure === 'profile error' ? error : null,
        } as never);
      }

      await expect(handleDeleteAccountAction({ lang: 'en' })).resolves.toEqual({
        error: 'subscriptionCheckFailed',
      });

      expect(captureException).toHaveBeenCalled();
      expect(sessionSupabase.auth.updateUser).not.toHaveBeenCalled();
      expect(sessionSupabase.from).not.toHaveBeenCalled();
      expect(deleteFileFromR2).not.toHaveBeenCalled();
      expect(createAdminClient).not.toHaveBeenCalled();
      expect(sessionSupabase.auth.signOut).not.toHaveBeenCalled();
      expect(encodedRedirect).not.toHaveBeenCalled();
    },
  );

  it('rejects unauthenticated requests before checking subscriptions', async () => {
    const { sessionSupabase } = setupAccountDeletion();
    sessionSupabase.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
    });

    await expect(handleDeleteAccountAction({ lang: 'en' })).rejects.toThrow(
      'User not found',
    );

    expect(getUserByIdWithError).not.toHaveBeenCalled();
    expect(hasOngoingSubscription).not.toHaveBeenCalled();
    expect(sessionSupabase.auth.updateUser).not.toHaveBeenCalled();
  });

  it('allows deletion when the profile has no Stripe customer', async () => {
    const { sessionSupabase } = setupAccountDeletion();
    vi.mocked(getUserByIdWithError).mockResolvedValueOnce({
      data: { stripe_id: null },
      error: null,
    } as never);

    await handleDeleteAccountAction({ lang: 'en' });

    expect(hasOngoingSubscription).toHaveBeenCalledWith(null);
    expect(sessionSupabase.auth.updateUser).toHaveBeenCalled();
    expect(sessionSupabase.auth.signOut).toHaveBeenCalled();
    expect(encodedRedirect).toHaveBeenCalledWith('success', '/en/', '');
  });

  it('uses the admin client for the user-scoped audio soft delete', async () => {
    const { adminSupabase, audioUpdate } = setupAccountDeletion();

    await handleDeleteAccountAction({ lang: 'en' });

    expect(adminSupabase.from).toHaveBeenCalledWith('audio_files');
    expect(audioUpdate.update).toHaveBeenCalledWith({
      deleted_at: expect.any(String),
      status: 'deleted',
    });
    expect(audioUpdate.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(audioUpdate.select).toHaveBeenCalledWith('id');
    expect(deleteFileFromR2).toHaveBeenCalledWith('audio/one.mp3');
    expect(logger.info).toHaveBeenCalledWith(
      'User deleted',
      expect.objectContaining({ usageEventsRetained: 3 }),
    );
  });

  it('continues when the retained usage-event count is unavailable', async () => {
    const usageCountError = new Error('Count unavailable');
    const { sessionSupabase } = setupAccountDeletion({
      usageResult: { count: null, error: usageCountError },
    });

    await handleDeleteAccountAction({ lang: 'en' });

    expect(
      sessionSupabase.from.mock.calls.filter(
        ([table]) => table === 'usage_events',
      ),
    ).toHaveLength(1);
    expect(captureException).toHaveBeenCalledWith(usageCountError, {
      extra: { context: 'retained usage event count during account deletion' },
      level: 'warning',
      user: { email: 'user@example.com', id: 'user-1' },
    });
    expect(logger.info).toHaveBeenCalledWith(
      'User deleted',
      expect.objectContaining({ usageEventsRetained: null }),
    );
  });
});
