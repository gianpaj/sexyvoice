import { Apple } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Link } from '@/lib/i18n/navigation';
import { LogosGoogleIcon } from '@/lib/icons';
import type { Locale } from '@/lib/i18n/i18n-config';
import { createClient } from '@/lib/supabase/server';
import { AccountHeader } from './account-header';
import { DeleteAccountButton } from './delete-account-button';

export default async function ProfilePage(props: {
  params: Promise<{ lang: Locale }>;
}) {
  const { lang } = await props.params;
  const t = await getTranslations({ locale: lang, namespace: 'profile' });
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data?.user;

  if (!user) {
    return <div>{t('notLoggedIn')}</div>;
  }

  const displayName =
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.user_metadata?.username ||
    user.email?.split('@')[0] ||
    'User';

  const identities = user.identities || [];
  const googleIdentity = identities.find((i) => i.provider === 'google');
  const appleIdentity = identities.find((i) => i.provider === 'apple');
  const avatarLetter = displayName.charAt(0).toUpperCase();

  return (
    <div className="mx-auto max-w-lg space-y-6 px-4 py-6">
      <AccountHeader />

      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-lg font-medium">
          {avatarLetter}
        </div>
        <div>
          <p className="font-medium">{displayName}</p>
          <p className="text-muted-foreground text-sm">{user.email}</p>
        </div>
      </div>

      <section>
        <h2 className="mb-4 font-semibold text-lg">{t('myPlan.title')}</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{t('myPlan.creativeEnergy')}</p>
              <p className="text-muted-foreground text-sm">
                {t('myPlan.energyReplenish', { hours: '13' })}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <div className="h-6 w-10 rounded border-2 border-muted-foreground/30 p-0.5">
                <div className="h-full w-1/3 rounded-sm bg-green-500" />
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <p className="font-medium">{t('myPlan.freePlan')}</p>
            <Button asChild variant="outline">
              <Link href="/dashboard/credits">{t('myPlan.upgrade')}</Link>
            </Button>
          </div>
        </div>
      </section>

      <Separator />

      <section>
        <h2 className="mb-4 font-semibold text-lg">{t('login.title')}</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{t('login.password')}</p>
              <p className="text-muted-foreground text-sm">
                {t('login.resetPassword')}
              </p>
            </div>
            <Button asChild variant="outline">
              <Link href="/reset-password">{t('login.reset')}</Link>
            </Button>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Apple className="h-5 w-5" />
              <div>
                <p className="font-medium">{t('login.apple')}</p>
                <p className="text-muted-foreground text-sm">
                  {appleIdentity
                    ? appleIdentity.identity_data?.email
                    : t('login.notConnected')}
                </p>
              </div>
            </div>
            <Button disabled={!!appleIdentity} variant="outline">
              {appleIdentity ? t('login.remove') : t('login.connect')}
            </Button>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <LogosGoogleIcon className="h-5 w-5" />
              <div>
                <p className="font-medium">{t('login.google')}</p>
                <p className="text-muted-foreground text-sm">
                  {googleIdentity
                    ? googleIdentity.identity_data?.email
                    : t('login.notConnected')}
                </p>
              </div>
            </div>
            <Button disabled={!!googleIdentity} variant="outline">
              {googleIdentity ? t('login.remove') : t('login.connect')}
            </Button>
          </div>
        </div>
      </section>

      <Separator />

      <section>
        <h2 className="mb-4 font-semibold text-lg">{t('support.title')}</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{t('support.faq')}</p>
              <p className="text-muted-foreground text-sm">
                {t('support.faqDescription')}
              </p>
            </div>
            <Button asChild variant="outline">
              <Link href="/#faq" target="_blank">
                {t('support.open')}
              </Link>
            </Button>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{t('support.contactSupport')}</p>
              <p className="text-muted-foreground text-sm">
                {t('support.contactDescription')}
              </p>
            </div>
            <Button asChild variant="outline">
              <a href="mailto:support@sexyvoice.ai">{t('support.contact')}</a>
            </Button>
          </div>
        </div>
      </section>

      <Separator />

      <section className="space-y-3">
        <DeleteAccountButton />
        <Link
          className="block text-foreground hover:underline"
          href="/privacy-policy"
          target="_blank"
        >
          {t('links.privacyPolicy')}
        </Link>
        <Link
          className="block text-foreground hover:underline"
          href="/terms"
          target="_blank"
        >
          {t('links.termsOfService')}
        </Link>
        <Link
          className="block text-foreground hover:underline"
          href="/dashboard/credits"
        >
          {t('links.enableApiAccess')}
        </Link>
      </section>
    </div>
  );
}
