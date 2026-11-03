import { callVoiceProvider } from '@/lib/call-voices';
import {
  CALL_CLONE_PROVIDERS,
  type CallCloneProvider,
} from '@/lib/clone/call-voice-config';
import { getVoiceIdByName } from './queries';
import { createClient } from './server';

export async function getSavedCallVoices(userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('audio_references')
    .select('id, name, locale, provider')
    .eq('user_id', userId)
    .in('provider', CALL_CLONE_PROVIDERS)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function countSavedCallVoices(userId: string) {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from('audio_references')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .in('provider', CALL_CLONE_PROVIDERS);
  if (error) throw error;
  return count ?? 0;
}

export async function getOwnedCallVoice(
  id: string,
  userId: string,
  provider?: CallCloneProvider,
) {
  const supabase = await createClient();
  const query = supabase
    .from('audio_references')
    .select('id, name, locale, voice_id, provider, sample_url')
    .eq('id', id)
    .eq('user_id', userId);
  const { data, error } = await (provider
    ? query.eq('provider', provider)
    : query.in('provider', CALL_CLONE_PROVIDERS)
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
