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
 * `record_audio_vote` does the write atomically: it locks the caller's
 * newest active row for the URL, reads the stored vote from `audio_votes`,
 * applies the delta to `total_votes`, and saves the vote in one transaction.
 * Votes key off `audio_file_id`, so a deleted-and-regenerated URL starts
 * unrated. Only the row owner may vote — the counter ranks
 * /api/popular-audios, so voting on someone else's audio would manipulate
 * global rankings.
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
      const { data: totalVotes, error } = await admin.rpc('record_audio_vote', {
        p_audio_url: audioUrl,
        p_user_id: claims.sub,
        p_vote: vote ?? undefined,
      });

      if (error) throw error;
      if (typeof totalVotes === 'number') {
        return NextResponse.json(
          { success: true, totalVotes },
          { status: 200 },
        );
      }

      // NULL means the caller owns no active row for the URL yet.
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
    const { data, error } = await admin.rpc('get_audio_vote', {
      p_audio_url: audioUrl,
      p_user_id: claims.sub,
    });

    if (error) throw error;

    return NextResponse.json(
      { vote: data === 'up' || data === 'down' ? data : null },
      { status: 200 },
    );
  } catch (error) {
    captureException(error, { extra: { context: 'audio-vote' } });
    console.error('Audio vote error:', error);
    return APIErrorResponse('Internal server error', 500);
  }
}
