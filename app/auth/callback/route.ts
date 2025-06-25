import { NextResponse } from 'next/server';

import PostHogClient from '@/lib/posthog';
import { createOrRetrieveCustomer } from '@/lib/stripe/stripe-admin';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  // The `/auth/callback` route is required for the server-side auth flow implemented
  // by the SSR package. It exchanges an auth code for the user's session.
  // https://supabase.com/docs/guides/auth/server-side/nextjs
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const origin = requestUrl.origin;
  const redirectTo = requestUrl.searchParams.get('redirect_to')?.toString();

  if (!code) {
    return NextResponse.redirect(`${origin}/login`);
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.exchangeCodeForSession(code);

  const email = user?.email;
  if (!email) {
    return NextResponse.redirect(`${origin}/login`);
  }

  // Add Stripe customer creation
  if (user) {
    const stripe_id = await createOrRetrieveCustomer({
      uuid: user.id,
      email,
    });
    await supabase
      .from('profiles')
      .update({
        stripe_id,
      })
      .eq('id', user.id);

    const posthog = PostHogClient();

    posthog.capture({
      distinctId: user.id,
      event: 'sign-up',
      // properties: {
      //   // login_type: 'email',
      //   is_free_trial: true,
      // },
    });
    await posthog.shutdown();
  }

  if (redirectTo) {
    return NextResponse.redirect(`${origin}${redirectTo}`);
  }

  // URL to redirect to after sign up process completes
  return NextResponse.redirect(`${origin}/dashboard/generate`);
}
