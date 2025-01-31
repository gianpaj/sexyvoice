import { createClient } from '@/lib/supabase/server';
import { getDictionary } from '@/lib/i18n/get-dictionary';
import type { Locale } from '@/lib/i18n/i18n-config';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, CreditCard } from 'lucide-react';
import { CreditHistory } from './credit-history';

export default async function CreditsPage({
  params: { lang },
}: {
  params: { lang: Locale };
}) {
  const supabase = createClient();
  const dict = await getDictionary(lang);

  const { data } = await supabase.auth.getUser();
  const user = data?.user;

  const { data: credits } = await supabase
    .from('credits')
    .select('amount')
    .eq('user_id', user?.id)
    .single();

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Credits</h2>
          <p className="text-muted-foreground">
            Manage your credits and view usage history
          </p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Buy Credits
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Available Credits
            </CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{credits?.amount || 0}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Credits are used for voice generation
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="mt-8">
        <h3 className="mb-4 text-lg font-semibold">Credit History</h3>
        <CreditHistory userId={user?.id} />
      </div>
    </div>
  );
}
