import { captureException } from '@sentry/nextjs';
import { Redis } from '@upstash/redis';
import { NextResponse } from 'next/server';

import { APIErrorResponse } from '@/lib/error-ts';
import { createAdminClient } from '@/lib/supabase/admin';
import { getVerifiedClaims } from '@/lib/supabase/auth';
import { createClient } from '@/lib/supabase/server';

const redis = Redis.fromEnv();

/**
 * POST /api/audio-vote — thumbs up/down on a generated audio file.
 *
 * One route serves both screens because `POST /api/generate-voice` and
 * `POST /api/clone-voice` write the same `audio_files` row for the uploaded
 * result and return only its public URL, so the URL identifies the file.
 *
 * The row is inserted in `after()` — after the generation response has
 * already reached the client — so the lookup retries briefly before
 * reporting the file as missing.
 *
 * `total_votes` is a global counter (it ranks /api/popular-audios), so the
 * authenticated user's previous vote is tracked in Redis to turn a toggle
 * into the correct delta without a schema change.
 */

type VoteValue = 'down' | 'up';

const VOTE_DELTAS: Record<VoteValue, number> = { down: -1, up: 1 };

// Generations write their audio_files row in after(); give it a moment.
const LOOKUP_DELAYS_MS = [250, 500, 1000] as const;

const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

function voteKey(userId: string, audioUrl: string) {
  return `audio-vote:${userId}:${audioUrl}`;
}

async function findAudioFile(
  admin: ReturnType<typeof createAdminClient>,
  audioUrl: string,
) {
  for (let attempt = 0; ; attempt++) {
    const { data, error } = await admin
      .from('audio_files')
      .select('id, total_votes')
      .eq('url', audioUrl)
      .eq('status', 'active')
      .maybeSingle();

    if (error) throw error;
    if (data) return data;

    const delay = LOOKUP_DELAYS_MS[attempt];
    if (delay === undefined) return null;
    await sleep(delay);
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const claims = await getVerifiedClaims(supabase);

    if (!claims?.sub) {
      return APIErrorResponse('Unauthorized', 401);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return APIErrorResponse('Invalid request body', 400);
    }

    const { audioUrl, vote } =
      typeof body === 'object' && body !== null
        ? (body as { audioUrl?: unknown; vote?: unknown })
        : {};
    if (
      typeof audioUrl !== 'string' ||
      audioUrl.length === 0 ||
      !(vote === 'up' || vote === 'down' || vote === null)
    ) {
      return APIErrorResponse(
        'audioUrl and a vote of "up", "down" or null are required',
        400,
      );
    }

    const key = voteKey(claims.sub, audioUrl);
    const storedVote = await redis.get<VoteValue>(key);
    const previousVote =
      storedVote === 'up' || storedVote === 'down' ? storedVote : null;
    const previousDelta = previousVote ? VOTE_DELTAS[previousVote] : 0;
    const nextDelta = vote ? VOTE_DELTAS[vote] : 0;
    const delta = nextDelta - previousDelta;

    if (delta === 0) {
      return NextResponse.json({ success: true }, { status: 200 });
    }

    const admin = createAdminClient();
    const audioFile = await findAudioFile(admin, audioUrl);
    if (!audioFile) {
      return APIErrorResponse('Audio file not found', 404);
    }

    const totalVotes = audioFile.total_votes + delta;
    const { error: updateError } = await admin
      .from('audio_files')
      .update({ total_votes: totalVotes })
      .eq('id', audioFile.id);

    if (updateError) {
      captureException(updateError, {
        extra: { audioFileId: audioFile.id, context: 'audio-vote' },
      });
      return APIErrorResponse('Failed to record vote', 500);
    }

    if (vote === null) {
      await redis.del(key);
    } else {
      await redis.set(key, vote);
    }

    return NextResponse.json(
      { success: true, totalVotes },
      { status: 200 },
    );
  } catch (error) {
    captureException(error, { extra: { context: 'audio-vote' } });
    console.error('Audio vote error:', error);
    return APIErrorResponse('Internal server error', 500);
  }
}
