// biome-ignore lint/performance/noNamespaceImport: keep Sentry imports consistent with its Next.js integration
import * as Sentry from '@sentry/nextjs';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import {
  analyzeTranscript,
  extractMessages,
  MIN_ANALYSIS_CALL_DURATION_SECONDS,
} from '@/lib/ai/analyze-call';
import { APIErrorResponse } from '@/lib/error-ts';
import {
  CONTENT_REFUSAL_STATUS_CODE,
  isProviderContentRefusal,
} from '@/lib/provider-errors';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  enqueueCallAnalysis,
  hasCallSessionAnalysis,
  upsertCallSessionAnalysis,
} from '@/lib/supabase/call-analysis-queries';

// The default Node runtime (not Edge) is required for the service-role
// Supabase client. The default engine only enqueues, so the request is short;
// the generous limit covers the CALL_ANALYSIS_REALTIME bypass, where Grok
// structured generation can take several seconds.
export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Emergency / local-debugging bypass: analyse inline with a synchronous Grok
 * call instead of queueing for the xAI Batch API drain job.
 */
function isRealtimeBypassEnabled() {
  return process.env.CALL_ANALYSIS_REALTIME === 'true';
}

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

  // Idempotency / sanity guards. Webhooks, the drain job and the backfill
  // script can all fire, so a no-op (200) is the correct response when there's
  // nothing to do.
  if (
    session.status !== 'completed' ||
    (session.duration_seconds ?? 0) < MIN_ANALYSIS_CALL_DURATION_SECONDS ||
    extractMessages(session.transcript).length === 0
  ) {
    return NextResponse.json({ skipped: true });
  }

  try {
    if (await hasCallSessionAnalysis(supabase, id)) {
      return NextResponse.json({ skipped: true });
    }
  } catch (error) {
    console.error('Error checking existing analysis:', error);
    return APIErrorResponse('Failed to check existing analysis', 500);
  }

  if (!isRealtimeBypassEnabled()) {
    try {
      // Record intent only: /api/call-sessions/analyze/batch coalesces pending
      // rows into one xAI batch and writes call_session_analysis when it
      // settles. The queue's primary key makes duplicate deliveries a no-op.
      await enqueueCallAnalysis(supabase, id);
      return NextResponse.json({ queued: true }, { status: 202 });
    } catch (error) {
      console.error('Call analysis enqueue error:', error);
      Sentry.captureException(error, { extra: { callSessionId: id } });
      return APIErrorResponse('Failed to queue call analysis', 500);
    }
  }

  try {
    const analysis = await analyzeTranscript(session);
    await upsertCallSessionAnalysis(supabase, session, analysis);
    return NextResponse.json({ ok: true });
  } catch (error) {
    // A content-policy refusal is deterministic: the same transcript can only
    // be declined again, so skip it terminally (200) and record it once as a
    // countable, non-actionable warning instead of an error page.
    if (isProviderContentRefusal(error)) {
      console.warn('Call analysis declined by provider', {
        callSessionId: id,
        statusCode: CONTENT_REFUSAL_STATUS_CODE,
      });
      Sentry.captureMessage('Call analysis declined by provider', {
        extra: { callSessionId: id },
        fingerprint: ['call-analysis-provider-refusal'],
        level: 'warning',
      });
      return NextResponse.json({ reason: 'provider_refused', skipped: true });
    }

    console.error('Call analysis error:', error);
    Sentry.captureException(error, { extra: { callSessionId: id } });

    // Don't persist an analysis row on failure: with the "row exists" idempotency
    // check above, that would block all retries. Leaving no row lets the next
    // webhook fire, the drain job or the backfill script reprocess this session.
    return APIErrorResponse('Failed to analyze call', 500);
  }
}
