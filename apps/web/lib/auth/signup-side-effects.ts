import { captureMessage } from '@sentry/nextjs';
import type { User } from '@supabase/supabase-js';

import PostHogClient from '@/lib/posthog';
import { createOrRetrieveCustomer } from '@/lib/stripe/stripe-admin';

export type SignupLoginType = 'email' | 'social';

export async function recordSignupSideEffects(
  user: User,
  loginType: SignupLoginType,
) {
  const email = user.email;

  if (!email) {
    captureMessage(
      'Signup side effects skipped because user email is missing.',
      {
        level: 'error',
        tags: {
          area: 'auth',
          flow: 'signup-side-effects',
        },
        extra: {
          userId: user.id,
          loginType,
        },
      },
    );
    return;
  }

  const stripeId = await createOrRetrieveCustomer(user.id, email);
  if (!stripeId) {
    console.error('Failed to create Stripe customer.');
    captureMessage('Failed to create Stripe customer.', {
      level: 'error',
      user: { id: user.id, email },
    });
  }

  const posthog = PostHogClient();

  posthog.capture({
    distinctId: user.id,
    event: 'sign-up',
    properties: {
      login_type: loginType,
    },
  });

  await posthog.shutdown();
}
