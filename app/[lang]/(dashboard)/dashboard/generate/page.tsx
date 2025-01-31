import { createClient } from '@/lib/supabase/server';
import { getDictionary } from '@/lib/i18n/get-dictionary';
import type { Locale } from '@/lib/i18n/i18n-config';
import { VoiceSelector } from './voice-selector';
import { AudioGenerator } from './audio-generator';

export default async function GeneratePage({
  params: { lang },
}: {
  params: { lang: Locale };
}) {
  const supabase = createClient();
  const dict = await getDictionary(lang);

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user;

  // Get user's voices
  const { data: userVoices } = await supabase
    .from('voices')
    .select('*')
    .eq('user_id', user?.id);

  // Get public voices
  const { data: publicVoices } = await supabase
    .from('voices')
    .select('*')
    .eq('is_public', true)
    .neq('user_id', user?.id);

  // Get user's credits
  const { data: credits } = await supabase
    .from('credits')
    .select('amount')
    .eq('user_id', user?.id)
    .single();

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Generate Audio</h2>
        <p className="text-muted-foreground">
          Select a voice and generate audio from text
        </p>
      </div>

      <div className="grid gap-6">
        <VoiceSelector
          userVoices={userVoices || []}
          publicVoices={publicVoices || []}
          lang={lang}
        />
        <AudioGenerator credits={credits?.amount || 0} />
      </div>
    </div>
  );
}
