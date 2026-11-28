import { captureException } from '@sentry/nextjs';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { NextResponse } from 'next/server';

import { APIErrorResponse } from '@/lib/error-ts';
import { createAdminClient } from '@/lib/supabase/admin';
import { getVerifiedClaims } from '@/lib/supabase/auth';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/audio-vote — thumbs up/down on a generated audio file.
 * GET /api/audio-vote — read the caller's stored vote for an audio URL.
 *
 * One route serves both screens because `POST /api/generate-voice` and
 * `POST /api/clone-voice` write the same `audio_files` row for the uploaded
 * result and return only its public URL, so the URL identifies the file.
 *
 * Voting is owner-only, so `audio_files.total_votes` is the owner's tri-state
 * vote for now: `1` up, `-1` down, `0` cleared. Only the newest active row for
 * the URL is used, so a deleted-and-regenerated URL starts unrated. If voting
 * later becomes public, per-user vote rows and an aggregate counter will need
 * a schema change; keeping those separate is unnecessary for the owner-only
 * flow.
 *
 * The row is inserted in `after()` — after the generation response has
 * already reached the client — so POST retries briefly before reporting the
 * file as missing. The per-user rate limit bounds what repeated calls to
 * unknown URLs can cost those retries.
 */

const redis = Redis.fromEnv();

// Interactive voting, plus one lookup per mounted control — split mode can
// render up to 20 at once.
const voteRateLimit = new Ratelimit({
  limiter: Ratelimit.slidingWindow(60, '60 s'),
  prefix: 'audio-vote',
  redis,
});

// Generations write their audio_files row in after(); give it a moment.
const LOOKUP_DELAYS_MS = [250, 500, 1000, 2000, 4000] as const;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function voteValue(vote: 'down' | 'up' | null) {
  if (vote === 'up') return 1;
  if (vote === 'down') return -1;
  return 0;
}

function storedVote(totalVotes: number | undefined) {
  if (totalVotes === 1) return 'up';
  if (totalVotes === -1) return 'down';
  return null;
}

async function findNewestActiveAudioFile(
  admin: ReturnType<typeof createAdminClient>,
  audioUrl: string,
  userId: string,
) {
  const { data, error } = await admin
    .from('audio_files')
    .select('id,total_votes')
    .eq('url', audioUrl)
    .match({ status: 'active', user_id: userId })
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) throw error;
  return data[0] ?? null;
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

    const rateLimit = await voteRateLimit.limit(claims.sub);
    if (!rateLimit.success) {
      return APIErrorResponse('Too many requests', 429);
    }

    const admin = createAdminClient();
    for (let attempt = 0; ; attempt++) {
      const audioFile = await findNewestActiveAudioFile(
        admin,
        audioUrl,
        claims.sub,
      );

      if (audioFile) {
        const totalVotes = voteValue(vote);
        const { error } = await admin
          .from('audio_files')
          .update({ total_votes: totalVotes })
          .eq('id', audioFile.id)
          .eq('user_id', claims.sub);

        if (error) throw error;
        return NextResponse.json(
          { success: true, totalVotes },
          { status: 200 },
        );
      }

      // The generation writes its row in after(); retry briefly before 404.
      const delay = LOOKUP_DELAYS_MS[attempt];
      if (delay === undefined) {
        return APIErrorResponse('Audio file not found', 404);
      }
      await sleep(delay);
    }
  } catch (error) {
    captureException(error, { extra: { context: 'audio-vote' } });
    console.error('Audio vote error:', error);
    return APIErrorResponse('Internal server error', 500);
  }
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const claims = await getVerifiedClaims(supabase);

    if (!claims?.sub) {
      return APIErrorResponse('Unauthorized', 401);
    }

    const audioUrl = new URL(request.url).searchParams.get('audioUrl');
    if (!audioUrl) {
      return APIErrorResponse('audioUrl is required', 400);
    }

    const rateLimit = await voteRateLimit.limit(claims.sub);
    if (!rateLimit.success) {
      return APIErrorResponse('Too many requests', 429);
    }

    const admin = createAdminClient();
    const audioFile = await findNewestActiveAudioFile(
      admin,
      audioUrl,
      claims.sub,
    );

    return NextResponse.json(
      {
        vote: storedVote(audioFile?.total_votes),
      },
      { status: 200 },
    );
  } catch (error) {
    captureException(error, { extra: { context: 'audio-vote' } });
    console.error('Audio vote error:', error);
    return APIErrorResponse('Internal server error', 500);
  }
}
