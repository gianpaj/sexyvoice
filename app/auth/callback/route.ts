import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { createOrRetrieveCustomer } from '@/lib/stripe/stripe-admin'

export async function GET(request: Request) {
  // The `/auth/callback` route is required for the server-side auth flow implemented
  // by the SSR package. It exchanges an auth code for the user's session.
  // https://supabase.com/docs/guides/auth/server-side/nextjs
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const origin = requestUrl.origin

  if (code) {
    const supabase = createClient()
    const {
      data: { user }
    } = await supabase.auth.exchangeCodeForSession(code)

    const email = user?.email
    if (!email) {
      return NextResponse.redirect(`${origin}/login`)
    }

    // Add Stripe customer creation
    if (user) {
      const stripe_id = await createOrRetrieveCustomer({
        uuid: user.id,
        email
      })
      await supabase
        .from('profiles')
        .update({
          stripe_id
        })
        .eq('id', user.id)
    }
  }

  // URL to redirect to after sign up process completes
  return NextResponse.redirect(`${origin}/dashboard`)
}
