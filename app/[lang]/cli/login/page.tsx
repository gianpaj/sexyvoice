import { redirect } from 'next/navigation';

import Footer from '@/components/footer';
import { HeaderStatic } from '@/components/header-static';
import type { Locale } from '@/lib/i18n/i18n-config';
import { isAllowedCliCallbackUrl } from '@/lib/api/cli-login';
import { hasUserPaid } from '@/lib/supabase/queries';
import { createClient } from '@/lib/supabase/server';
import { CliLoginClient } from './cli-login-client';

export default async function CliLoginPage(props: {
  params: Promise<{ lang: Locale }>;
  searchParams: Promise<{ callback_url?: string; state?: string }>;
}) {
  const { lang } = await props.params;
  const { callback_url, state } = await props.searchParams;

  if (!(callback_url && state && isAllowedCliCallbackUrl(callback_url))) {
    return (
      <>
        <HeaderStatic />
        <main className="mx-auto flex min-h-[calc(100vh-65px)] w-full max-w-3xl items-center px-4 py-12">
          <div className="rounded-2xl border bg-background p-8 shadow-sm">
            <h1 className="font-bold text-2xl">Invalid CLI login request</h1>
            <p className="mt-3 text-muted-foreground">
              The callback URL is missing or is not a localhost address.
            </p>
          </div>
        </main>
        <Footer lang={lang} />
      </>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const redirectTo = `/${lang}/cli/login?callback_url=${encodeURIComponent(callback_url)}&state=${encodeURIComponent(state)}`;
  if (!user) {
    redirect(`/${lang}/login?redirect_to=${encodeURIComponent(redirectTo)}`);
  }

  const [{ data: keys }, isPaidUser] = await Promise.all([
    supabase
      .from('api_keys')
      .select('id, name, key_prefix, created_at, last_used_at, expires_at')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false }),
    hasUserPaid(user.id),
  ]);

  return (
    <>
      <HeaderStatic />
      <main className="mx-auto flex min-h-[calc(100vh-65px)] w-full max-w-3xl items-center px-4 py-12">
        <CliLoginClient
          callbackUrl={callback_url}
          hasCreateAccess={isPaidUser}
          keys={keys ?? []}
          state={state}
        />
      </main>
      <Footer lang={lang} />
    </>
  );
}
