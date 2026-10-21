import { createClient } from './server';

export async function getSavedCallVoices(userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('audio_references')
    .select('id, name, locale')
    .eq('user_id', userId)
    .eq('provider', 'mistral')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function getOwnedCallVoice(id: string, userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('audio_references')
    .select('id, name, locale, voice_id')
    .eq('id', id)
    .eq('user_id', userId)
    .eq('provider', 'mistral')
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function resolveCallVoice(
  config: { model: string; voice: string; audioReferenceId?: string },
  userId: string,
) {
  if (config.model === 'mistral-tts') {
    if (!config.audioReferenceId) return null;
    const reference = await getOwnedCallVoice(config.audioReferenceId, userId);
    return reference ? { id: reference.id, name: reference.name } : null;
  }
  if (config.audioReferenceId) return null;
  const { getVoiceIdByName } = await import('./queries');
  try {
    return await getVoiceIdByName(config.voice);
  } catch {
    return null;
  }
}
