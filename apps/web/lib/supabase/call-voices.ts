import { callVoiceProvider } from '@/lib/call-voices';
import { getVoiceIdByName } from './queries';
import { createClient } from './server';

export async function getSavedCallVoices(userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('audio_references')
    .select('id, name, locale, provider')
    .eq('user_id', userId)
    .in('provider', ['mistral', 'inworld'])
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function getOwnedCallVoice(
  id: string,
  userId: string,
  provider?: 'inworld' | 'mistral',
) {
  const supabase = await createClient();
  const query = supabase
    .from('audio_references')
    .select('id, name, locale, voice_id, provider, sample_url')
    .eq('id', id)
    .eq('user_id', userId);
  const { data, error } = await (provider
    ? query.eq('provider', provider)
    : query.in('provider', ['mistral', 'inworld'])
  ).maybeSingle();
  if (error) throw error;
  return data;
}

export async function resolveCallVoice(
  config: { model: string; voice: string; audioReferenceId?: string },
  userId: string,
) {
  const provider = callVoiceProvider(config.model);
  if (provider) {
    if (!config.audioReferenceId) return null;
    const reference = await getOwnedCallVoice(
      config.audioReferenceId,
      userId,
      provider,
    );
    return reference?.provider === provider
      ? { id: reference.id, name: reference.name }
      : null;
  }
  if (config.audioReferenceId) return null;
  try {
    return await getVoiceIdByName(config.voice);
  } catch {
    return null;
  }
}
