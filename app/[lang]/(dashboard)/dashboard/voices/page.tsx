import { Plus } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { getDictionary } from '@/lib/i18n/get-dictionary';
import type { Locale } from '@/lib/i18n/i18n-config';
import { createClient } from '@/lib/supabase/server';
import { VoicesList } from './voices-list';

export default async function VoicesPage(props: {
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

  const { data: voices } = await supabase
    .from('voices')
    .select('*')
    .eq('user_id', user?.id)
    .order('created_at', { ascending: false });

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Voices</h2>
          <p className="text-muted-foreground">
            Manage your voice clones and create new ones
          </p>
        </div>
        <Link href={`/${lang}/dashboard/voices/new`}>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Voice
          </Button>
        </Link>
      </div>

      <VoicesList voices={voices || []} lang={lang} />
    </div>
  );
}
