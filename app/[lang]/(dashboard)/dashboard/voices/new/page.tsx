import { createClient } from '@/lib/supabase/server';
import NewVoiceClient from './new.client';

export default async function NewVoicePage(props: {
  params: Promise<{ lang: string }>;
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
    // .eq('is_public', false)
    .order('created_at', { ascending: false });

  return <NewVoiceClient voices={voices} lang={lang} />;
}
