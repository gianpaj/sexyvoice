import 'server-only';

import { captureException, captureMessage } from '@sentry/nextjs';

import { createAdminClient } from './admin';

interface ApplicationStateUser {
  createdAt: string;
  email: string | null | undefined;
  id: string;
}

export type ApplicationStateStatus = 'existing' | 'restored';

const getTelemetryContext = (user: ApplicationStateUser) => ({
  tags: {
    area: 'auth',
    flow: 'inactive-user-reactivation',
  },
  user: { email: user.email ?? undefined, id: user.id },
});

export async function ensureUserApplicationState(
  user: ApplicationStateUser,
): Promise<ApplicationStateStatus> {
  if (!user.email) {
    const error = new Error(
      'Cannot restore inactive user application state without an email.',
    );
    captureException(error, {
      extra: { authCreatedAt: user.createdAt },
      ...getTelemetryContext(user),
    });
    throw error;
  }

  const admin = createAdminClient();
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) {
    const error = new Error('Failed to check user application state.', {
      cause: profileError,
    });
    captureException(error, {
      extra: {
        authCreatedAt: user.createdAt,
        profileError,
      },
      ...getTelemetryContext(user),
    });
    throw error;
  }

  if (profile) {
    return 'existing';
  }

  const { data: restored, error: restoreError } = await admin.rpc(
    'restore_inactive_user',
    {
      p_auth_created_at: user.createdAt,
      p_email: user.email,
      p_user_id: user.id,
    },
  );

  if (restoreError) {
    const error = new Error(
      'Failed to restore inactive user application state.',
      { cause: restoreError },
    );
    captureException(error, {
      extra: {
        authCreatedAt: user.createdAt,
        restoreError,
      },
      ...getTelemetryContext(user),
    });
    throw error;
  }

  if (!restored) {
    return 'existing';
  }

  captureMessage('Restored inactive user application state.', {
    extra: { authCreatedAt: user.createdAt },
    level: 'info',
    ...getTelemetryContext(user),
  });

  return 'restored';
}
