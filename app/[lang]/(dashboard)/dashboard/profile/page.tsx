import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
// import { ProfileForm } from './profile-form';
import { getMessages } from 'next-intl/server';

import type { Locale } from '@/lib/i18n/i18n-config';
import { createClient } from '@/lib/supabase/server';
import { DeleteAccountForm } from './delete-account-form';
import { SecurityForm } from './security-form';

export default async function ProfilePage(props: {
  params: { lang: Locale };
}) {
  const supabase = await createClient();
  const messages = (await getMessages()) as IntlMessages;
  const profileDict = messages.profile;

  const { data } = await supabase.auth.getUser();
  const user = data?.user;

  if (!user) {
    return <div>{profileDict.notLoggedIn}</div>;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      {/* <div>
        <h2 className="text-3xl font-bold tracking-tight">Profile Settings</h2>
        <p className="text-muted-foreground">
          Manage your account settings and preferences
        </p>
      </div> */}

      {/* <Tabs defaultValue="profile" className="space-y-6">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle>Personal Information</CardTitle>
              <CardDescription>
                Update your profile information and avatar
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ProfileForm initialData={profile} lang={lang} />
            </CardContent>
          </Card>
        </TabsContent> */}

      {/* <TabsContent value="security"> */}
      <Card>
        <CardHeader>
          <CardTitle>{profileDict.security.title}</CardTitle>
          <CardDescription>{profileDict.security.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <SecurityForm email={user.email} />
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
      {/* </TabsContent> */}
      {/* </Tabs> */}
    </div>
  );
}
