import type { SupabaseClient } from '@supabase/supabase-js';

import { deleteFileFromR2 } from '@/lib/storage/upload';
import { getCallVoiceSampleKey } from './call-voice-sample';
import { deleteInworldVoice } from './inworld';
import { deleteMistralVoice } from './mistral';

interface SavedVoiceReference {
  id: string;
  provider: string;
  sample_url: string | null;
  voice_id: string;
}

/**
 * Deletes the provider voice and its stored sample, then the row. The row
 * stays when either deletion fails, so the user can retry.
 */
export async function deleteSavedVoice(
  supabase: SupabaseClient<Database>,
  userId: string,
  reference: SavedVoiceReference,
) {
  const deleteProviderVoice = async () => {
    if (reference.provider === 'inworld') {
      await deleteInworldVoice(reference.voice_id);
    } else if (reference.provider === 'mistral') {
      await deleteMistralVoice(reference.voice_id);
    } else {
      throw new Error('Unsupported saved voice provider');
    }
  };
  const deleteSample = async () => {
    if (reference.sample_url) {
      await deleteFileFromR2(
        getCallVoiceSampleKey(reference.sample_url, reference.id),
      );
    }
  };
  const deletions = await Promise.allSettled([
    deleteProviderVoice(),
    deleteSample(),
  ]);
  const failure = deletions.find((result) => result.status === 'rejected');
  if (failure?.status === 'rejected') throw failure.reason;
  const { error } = await supabase
    .from('audio_references')
    .delete()
    .eq('id', reference.id)
    .eq('user_id', userId);
  if (error) throw error;
}
