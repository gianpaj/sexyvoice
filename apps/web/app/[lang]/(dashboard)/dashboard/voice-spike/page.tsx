import { randomUUID } from 'node:crypto';
import { notFound } from 'next/navigation';
import { z } from 'zod';

import { LiveKitVoiceChat } from '@/components/call/livekit-voice-chat';
import type { Locale } from '@/lib/i18n/i18n-config';
import { getVerifiedClaims } from '@/lib/supabase/auth';
import { hasUserPaid } from '@/lib/supabase/queries';
import { createClient } from '@/lib/supabase/server';
import {
  canUseCallChat,
  isLocalVoiceChatEnvironment,
} from '@/lib/voice-chat/access';
import { listVoiceChatCharacters } from '@/lib/voice-chat/characters';
import { startCharacterConversation } from './actions';

export default async function VoiceChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: Locale }>;
  searchParams: Promise<{
    voice?: string | string[];
    conversation?: string | string[];
  }>;
}) {
  if (!isLocalVoiceChatEnvironment()) notFound();
  const supabase = await createClient();
  const claims = await getVerifiedClaims(supabase);
  if (!(claims?.sub && canUseCallChat(claims.sub))) notFound();
  const [{ lang }, { voice, conversation }] = await Promise.all([
    params,
    searchParams,
  ]);
  const thread = z.uuid().optional().safeParse(conversation);
  if (Array.isArray(voice) || !thread.success) notFound();
  const [characters, savedThread] = await Promise.all([
    hasUserPaid(claims.sub).then((paid) =>
      paid ? listVoiceChatCharacters(claims.sub) : [],
    ),
    thread.data
      ? supabase
          .from('conversations')
          .select('character_id,character_name')
          .eq('user_id', claims.sub)
          .eq('id', thread.data)
          .maybeSingle()
      : undefined,
  ]);
  const characterName = savedThread?.data?.character_id
    ? savedThread.data.character_name
    : undefined;
  return (
    <LiveKitVoiceChat
      audioReferenceId={characterName ? undefined : voice}
      characterName={characterName}
      characters={characters}
      chatThreadId={thread.data ?? randomUUID()}
      conversationId={thread.data}
      key={thread.data ?? 'new'}
      startConversation={startCharacterConversation.bind(null, lang)}
    />
  );
}
