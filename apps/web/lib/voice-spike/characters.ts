import { z } from 'zod';

import { ModelId } from '@/data/models';
import { getSavedCallVoices } from '@/lib/supabase/call-voices';
import { getUserCallCharacters } from '@/lib/supabase/queries';

const inworldConfig = z.object({
  model: z.literal(ModelId.INWORLD_TTS),
  audioReferenceId: z.uuid(),
});

export function spikeCharacterVoiceReference(config: unknown) {
  return inworldConfig.safeParse(config).data?.audioReferenceId;
}

export async function listSpikeCharacters(userId: string) {
  const [characters, voices] = await Promise.all([
    getUserCallCharacters(userId),
    getSavedCallVoices(userId),
  ]);
  const inworldIds = new Set(
    voices.filter(({ provider }) => provider === 'inworld').map(({ id }) => id),
  );
  return characters.flatMap(({ id, name, session_config, prompts }) => {
    const voice = spikeCharacterVoiceReference(session_config);
    return voice && inworldIds.has(voice) && prompts?.prompt?.trim()
      ? [{ id, name }]
      : [];
  });
}
