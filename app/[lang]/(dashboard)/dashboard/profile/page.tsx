import { Apple } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { getDictionary } from '@/lib/i18n/get-dictionary';
import type { Locale } from '@/lib/i18n/i18n-config';
import { LogosGoogleIcon } from '@/lib/icons';
import { createClient } from '@/lib/supabase/server';
import { AccountHeader } from './account-header';
import { DeleteAccountButton } from './delete-account-button';

export default async function ProfilePage(props: {
  params: Promise<{ lang: Locale }>;
}) {
  const params = await props.params;
  const { lang } = params;

  const supabase = await createClient();
  const dict = await getDictionary(lang, 'profile');

  const { data } = await supabase.auth.getUser();
  const user = data?.user;

  if (!user) {
    return <div>{dict.notLoggedIn}</div>;
  }

  // Get user display name from metadata
  const displayName =
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.user_metadata?.username ||
    user.email?.split('@')[0] ||
    'User';

  // Check connected providers
  const identities = user.identities || [];
  const googleIdentity = identities.find((i) => i.provider === 'google');
  const appleIdentity = identities.find((i) => i.provider === 'apple');

  // Get first letter for avatar
  const avatarLetter = displayName.charAt(0).toUpperCase();

  return (
    <div className="mx-auto max-w-lg space-y-6 px-4 py-6">
      {/* Header */}
      <AccountHeader dict={dict} lang={lang} />

      {/* User Profile Section */}
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-lg font-medium">
          {avatarLetter}
        </div>
        <div>
          <p className="font-medium">{displayName}</p>
          <p className="text-muted-foreground text-sm">{user.email}</p>
        </div>
      </div>

      {/* My Plan Section */}
      <section>
        <h2 className="mb-4 font-semibold text-lg">{dict.myPlan.title}</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{dict.myPlan.creativeEnergy}</p>
              <p className="text-muted-foreground text-sm">
                {dict.myPlan.energyReplenish.replace('__HOURS__', '13')}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <div className="h-6 w-10 rounded border-2 border-muted-foreground/30 p-0.5">
                <div className="h-full w-1/3 rounded-sm bg-green-500" />
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <p className="font-medium">{dict.myPlan.freePlan}</p>
            <Button asChild variant="outline">
              <Link href={`/${lang}/dashboard/credits`}>{dict.myPlan.upgrade}</Link>
            </Button>
          </div>
        </div>
      </section>

      <Separator />

      {/* Login Section */}
      <section>
        <h2 className="mb-4 font-semibold text-lg">{dict.login.title}</h2>
        <div className="space-y-4">
          {/* Password */}
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{dict.login.password}</p>
              <p className="text-muted-foreground text-sm">
                {dict.login.resetPassword}
              </p>
            </div>
            <Button asChild variant="outline">
              <Link href={`/${lang}/reset-password`}>{dict.login.reset}</Link>
            </Button>
          </div>

          {/* Apple */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Apple className="h-5 w-5" />
              <div>
                <p className="font-medium">{dict.login.apple}</p>
                <p className="text-muted-foreground text-sm">
                  {appleIdentity
                    ? appleIdentity.identity_data?.email
                    : dict.login.notConnected}
                </p>
              </div>
            </div>
            <Button disabled={!!appleIdentity} variant="outline">
              {appleIdentity ? dict.login.remove : dict.login.connect}
            </Button>
          </div>

          {/* Google */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <LogosGoogleIcon className="h-5 w-5" />
              <div>
                <p className="font-medium">{dict.login.google}</p>
                <p className="text-muted-foreground text-sm">
                  {googleIdentity
                    ? googleIdentity.identity_data?.email
                    : dict.login.notConnected}
                </p>
              </div>
            </div>
            <Button disabled={!!googleIdentity} variant="outline">
              {googleIdentity ? dict.login.remove : dict.login.connect}
            </Button>
          </div>
        </div>
      </section>

      <Separator />

      {/* Support Section */}
      <section>
        <h2 className="mb-4 font-semibold text-lg">{dict.support.title}</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{dict.support.faq}</p>
              <p className="text-muted-foreground text-sm">
                {dict.support.faqDescription}
              </p>
            </div>
            <Button asChild variant="outline">
              <Link href="/faq" target="_blank">
                {dict.support.open}
              </Link>
            </Button>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{dict.support.contactSupport}</p>
              <p className="text-muted-foreground text-sm">
                {dict.support.contactDescription}
              </p>
            </div>
            <Button asChild variant="outline">
              <Link href="mailto:support@sexyvoice.ai">
                {dict.support.contact}
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <Separator />

      {/* Bottom Links */}
      <section className="space-y-3">
        <DeleteAccountButton dict={dict} lang={lang} />
        <Link
          className="block text-foreground hover:underline"
          href="/privacy"
          target="_blank"
        >
          {dict.links.privacyPolicy}
        </Link>
        <Link
          className="block text-foreground hover:underline"
          href="/terms"
          target="_blank"
        >
          {dict.links.termsOfService}
        </Link>
        <Link
          className="block text-foreground hover:underline"
          href={`/${lang}/dashboard/credits`}
        >
          {dict.links.enableApiAccess}
        </Link>
      </section>
    </div>
  );
}
