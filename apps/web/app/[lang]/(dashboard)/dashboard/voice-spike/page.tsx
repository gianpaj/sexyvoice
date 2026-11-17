import { notFound } from 'next/navigation';

import { LivekitSpike } from '@/components/call/livekit-spike';
import { getVerifiedClaims } from '@/lib/supabase/auth';
import { createClient } from '@/lib/supabase/server';
import { isSpikeAllowed } from '@/lib/voice-spike/protocol';

export default async function VoiceSpike() {
  const supabase = await createClient();
  const claims = await getVerifiedClaims(supabase);
  if (
    !(
      claims?.sub &&
      isSpikeAllowed(
        claims.sub,
        process.env.VOICE_SPIKE_USER_IDS,
        process.env.VERCEL_ENV,
        process.env.NODE_ENV,
      )
    )
  )
    notFound();
  return <LivekitSpike />;
}
