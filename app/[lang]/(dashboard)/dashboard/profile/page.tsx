import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
// import { ProfileForm } from './profile-form';
// import { getDictionary } from '@/lib/i18n/get-dictionary';
import type { Locale } from '@/lib/i18n/i18n-config';
import { createClient } from '@/lib/supabase/server';
import { SecurityForm } from './security-form';

export default async function ProfilePage(props: {
  params: Promise<{ lang: Locale }>;
}) {
  const params = await props.params;

  const { lang } = params;

  const supabase = await createClient();
  // const dict = await getDictionary(lang);

  const { data } = await supabase.auth.getUser();
  const user = data?.user;

  if (!user) {
    return <div>Not logged in</div>;
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
          <CardTitle>Security Settings</CardTitle>
          <CardDescription>Manage your email and password</CardDescription>
        </CardHeader>
        <CardContent>
          <SecurityForm email={user.email} lang={lang} />
        </CardContent>
      </Card>
      {/* </TabsContent> */}
      {/* </Tabs> */}
    </div>
  );
}
