import { captureException, captureMessage } from '@sentry/nextjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createAdminClient } from '@/lib/supabase/admin';
import { ensureUserApplicationState } from '@/lib/supabase/ensure-user-application-state';

const user = {
  createdAt: '2025-08-29T11:38:46.727Z',
  email: 'returning@example.com',
  id: 'returning-user-id',
};

function createAdminMock({
  profile,
  profileError = null,
  restoreData = false,
  restoreError = null,
}: {
  profile: { id: string } | null;
  profileError?: Record<string, unknown> | null;
  restoreData?: boolean;
  restoreError?: Record<string, unknown> | null;
}) {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: profile,
    error: profileError,
  });
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  const rpc = vi.fn().mockResolvedValue({
    data: restoreData,
    error: restoreError,
  });

  return { from, rpc };
}

describe('ensureUserApplicationState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('leaves an existing application profile unchanged', async () => {
    const admin = createAdminMock({
      profile: { id: user.id },
    });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    await expect(ensureUserApplicationState(user)).resolves.toBe('existing');

    expect(admin.from).toHaveBeenCalledWith('profiles');
    expect(admin.rpc).not.toHaveBeenCalled();
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it('accepts an existing profile when the Auth user has no email', async () => {
    const userWithoutEmail = { ...user, email: null };
    const admin = createAdminMock({
      profile: { id: user.id },
    });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    await expect(ensureUserApplicationState(userWithoutEmail)).resolves.toBe(
      'existing',
    );

    expect(admin.rpc).not.toHaveBeenCalled();
    expect(captureException).not.toHaveBeenCalled();
  });

  it('requires an email only when the profile is missing', async () => {
    const userWithoutEmail = { ...user, email: null };
    const admin = createAdminMock({
      profile: null,
    });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    await expect(ensureUserApplicationState(userWithoutEmail)).rejects.toThrow(
      'Cannot restore inactive user application state without an email.',
    );

    expect(admin.rpc).not.toHaveBeenCalled();
    expect(captureException).toHaveBeenCalledWith(expect.any(Error), {
      extra: { authCreatedAt: user.createdAt },
      tags: {
        area: 'auth',
        flow: 'inactive-user-reactivation',
      },
      user: { email: undefined, id: user.id },
    });
  });

  it('atomically restores a missing profile with the original Auth date', async () => {
    const admin = createAdminMock({
      profile: null,
      restoreData: true,
    });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    await expect(ensureUserApplicationState(user)).resolves.toBe('restored');

    expect(admin.rpc).toHaveBeenCalledWith('restore_inactive_user', {
      p_auth_created_at: user.createdAt,
      p_email: user.email,
      p_user_id: user.id,
    });
    expect(captureMessage).toHaveBeenCalledWith(
      'Restored inactive user application state.',
      {
        extra: { authCreatedAt: user.createdAt },
        level: 'info',
        tags: {
          area: 'auth',
          flow: 'inactive-user-reactivation',
        },
        user: { email: user.email, id: user.id },
      },
    );
  });

  it('treats a concurrent restoration as an existing profile', async () => {
    const admin = createAdminMock({
      profile: null,
      restoreData: false,
    });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    await expect(ensureUserApplicationState(user)).resolves.toBe('existing');

    expect(captureMessage).not.toHaveBeenCalled();
  });

  it('reports username collisions for manual resolution', async () => {
    const restoreError = {
      code: '23505',
      details:
        'The Auth email is already assigned to another profiles.username value.',
      hint: 'Resolve the conflicting profile username, then retry restoration.',
      message:
        'Inactive user profile restoration requires manual username conflict resolution',
    };
    const admin = createAdminMock({
      profile: null,
      restoreError,
    });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    await expect(ensureUserApplicationState(user)).rejects.toThrow(
      'Failed to restore inactive user application state.',
    );

    expect(captureException).toHaveBeenCalledWith(expect.any(Error), {
      extra: {
        authCreatedAt: user.createdAt,
        restoreError,
      },
      tags: {
        area: 'auth',
        flow: 'inactive-user-reactivation',
        reason: 'username-conflict',
      },
      user: { email: user.email, id: user.id },
    });
  });
});
