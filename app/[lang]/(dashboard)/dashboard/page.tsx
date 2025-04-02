import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getDictionary } from '@/lib/i18n/get-dictionary';
import type { Locale } from '@/lib/i18n/i18n-config';
import { createClient } from '@/lib/supabase/server';

export default async function DashboardPage(props: {
  params: Promise<{ lang: Locale }>;
}) {
  const params = await props.params;

  const { lang } = params;

  const supabase = await createClient();
  const dict = await getDictionary(lang);

  // Get user data
  const { data } = await supabase.auth.getUser();
  const user = data?.user;

  if (!user) {
    return <div>Unauthorized</div>;
  }

  // Get user's voices count
  // const { count: voicesCount } = await supabase
  //   .from('voices')
  //   .select('*', { count: 'exact', head: true })
  //   .eq('user_id', user?.id);

  // Get user's credits
  const { data: credits } = await supabase
    .from('credits')
    .select('amount')
    .eq('user_id', user?.id)
    .single();

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-muted-foreground">
          Welcome back,{' '}
          {user?.user_metadata.full_name ||
            user?.user_metadata.username ||
            'Guest'}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Voices</CardTitle>
            <Mic2 className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{voicesCount || 0}</div>
          </CardContent>
        </Card> */}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Available Credits
            </CardTitle>
            {/* <CreditCard className="size-4 text-muted-foreground" /> */}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{credits?.amount || 0}</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
