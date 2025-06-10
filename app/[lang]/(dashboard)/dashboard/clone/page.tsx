import { getCurrentUser } from '@/lib/supabase/get-current-user';
import NewVoiceClient from './new.client';

export default async function NewVoicePage(props: {
  params: Promise<{ lang: string }>;
}) {
  const { user } = await getCurrentUser();
  // const dict = await getDictionary(lang);
  if (!user) {
    return <div>Not logged in</div>;
  }
  return <NewVoiceClient />;
}
