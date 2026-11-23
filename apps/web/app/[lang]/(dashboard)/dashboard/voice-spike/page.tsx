import { randomUUID } from 'node:crypto';
import { notFound } from 'next/navigation';
import { z } from 'zod';

import { LivekitSpike } from '@/components/call/livekit-spike';
import { getVerifiedClaims } from '@/lib/supabase/auth';
import { createClient } from '@/lib/supabase/server';
import { isSpikeAllowed } from '@/lib/voice-spike/protocol';

export default async function VoiceSpike({
  searchParams,
}: {
  searchParams: Promise<{
    voice?: string | string[];
    conversation?: string | string[];
  }>;
}) {
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
  const { voice, conversation } = await searchParams;
  const thread = z.uuid().optional().safeParse(conversation);
  if (Array.isArray(voice) || !thread.success) notFound();
  return (
    <LivekitSpike
      audioReferenceId={voice}
      chatThreadId={thread.data ?? randomUUID()}
      conversationId={thread.data}
    />
  );
}
