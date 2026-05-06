import { getMessages } from 'next-intl/server';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { Locale } from '@/lib/i18n/i18n-config';
import { createClient } from '@/lib/supabase/server';
import { DeleteAccountForm } from './delete-account-form';
import { SecurityForm } from './security-form';

export default async function ProfilePage(props: {
  params: Promise<{ lang: Locale }>;
}) {
  const { lang } = await props.params;
  const profileDict = (
    (await getMessages({
      locale: lang,
    })) as IntlMessages
  ).profile;
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data?.user;

  if (!user) {
    return <div>{profileDict.notLoggedIn}</div>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>{profileDict.security.title}</CardTitle>
          <CardDescription>{profileDict.security.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <SecurityForm dict={profileDict.securityForm} email={user.email} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{profileDict.dangerZone.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <DeleteAccountForm />
        </CardContent>
      </Card>
    </div>
  );
}
