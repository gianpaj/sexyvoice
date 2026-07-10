/** biome-ignore-all lint/performance/noNamespaceImport: matches Sentry usage across api routes */
import * as Sentry from '@sentry/nextjs';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import {
  analyzeTranscript,
  extractMessages,
  MIN_ANALYSIS_CALL_DURATION_SECONDS,
  toAnalysisRow,
} from '@/lib/ai/analyze-call';
import { APIErrorResponse } from '@/lib/error-ts';
import { createAdminClient } from '@/lib/supabase/admin';

// Grok structured generation can take several seconds; the default Node runtime
// (not Edge) is required for the service-role Supabase client.
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  // Auth: the Supabase Database Webhook sends a shared secret. Mirrors the
  // CRON_SECRET pattern used by /api/daily-stats, but a distinct secret so the
  // webhook isn't conflated with the cron.
  const secret = process.env.CALL_SUMMARY_SECRET;
  // Guard against an unset secret: otherwise the comparison would succeed for a
  // literal `Bearer undefined`, leaving the endpoint open to anyone.
  if (!secret) {
    Sentry.captureMessage('CALL_SUMMARY_SECRET is not configured');
    return new NextResponse('Server misconfigured', { status: 500 });
  }
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${secret}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  let id: string | undefined;
  try {
    const body = await request.json();
    id = typeof body?.id === 'string' ? body.id : undefined;
  } catch {
    return APIErrorResponse('Invalid JSON body', 400);
  }

  if (!id) {
    return APIErrorResponse('Missing call session id', 400);
  }

  const supabase = createAdminClient();

  const { data: session, error: selectError } = await supabase
    .from('call_sessions')
    .select(
      'id, user_id, started_at, ended_at, duration_seconds, end_reason, model, voice_id, status, transcript',
    )
    .eq('id', id)
    .maybeSingle();

  if (selectError) {
    console.error('Error fetching call session:', selectError);
    return APIErrorResponse('Failed to fetch call session', 500);
  }

  if (!session) {
    return APIErrorResponse('Call session not found', 404);
  }

  // Idempotency / sanity guards. Webhooks and the backfill script can both fire,
  // so a no-op (200) is the correct response when there's nothing to do.
  if (
    session.status !== 'completed' ||
    (session.duration_seconds ?? 0) < MIN_ANALYSIS_CALL_DURATION_SECONDS ||
    extractMessages(session.transcript).length === 0
  ) {
    return NextResponse.json({ skipped: true });
  }

  const { count: existing, error: countError } = await supabase
    .from('call_session_analysis')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', id);

  if (countError) {
    console.error('Error checking existing analysis:', countError);
    return APIErrorResponse('Failed to check existing analysis', 500);
  }

  if ((existing ?? 0) > 0) {
    return NextResponse.json({ skipped: true });
  }

  try {
    const analysis = await analyzeTranscript(session);

    // Upsert with the unique session_id constraint as the source of truth: the
    // count check above avoids the LLM call in the common case, while
    // ignoreDuplicates closes the race when two webhook deliveries (or a webhook
    // and the backfill script) run concurrently.
    const { error: insertError } = await supabase
      .from('call_session_analysis')
      .upsert(toAnalysisRow(session, analysis), {
        onConflict: 'session_id',
        ignoreDuplicates: true,
      });

    if (insertError) {
      throw insertError;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Call analysis error:', error);
    Sentry.captureException(error, { extra: { callSessionId: id } });

    // Don't persist an analysis row on failure: with the "row exists" idempotency
    // check above, that would block all retries. Leaving no row lets the next
    // webhook fire or the backfill script reprocess this session.
    return APIErrorResponse('Failed to analyze call', 500);
  }
}
