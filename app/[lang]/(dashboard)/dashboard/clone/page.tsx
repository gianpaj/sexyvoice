import { createClient } from '@/lib/supabase/server';
import NewVoiceClient from './new.client';

export default async function NewVoicePage(props: {
  params: Promise<{ lang: string }>;
}) {
  const supabase = await createClient();
  // const dict = await getDictionary(lang);

  const { data } = await supabase.auth.getUser();
  const user = data?.user;
  if (!user) {
    return <div>Not logged in</div>;
  }
  return <NewVoiceClient />;
}
