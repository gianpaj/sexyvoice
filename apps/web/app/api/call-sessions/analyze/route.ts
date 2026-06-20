/** biome-ignore-all lint/performance/noNamespaceImport: matches Sentry usage across api routes */
import * as Sentry from '@sentry/nextjs';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { summarizeCall } from '@/lib/ai/summarize-call';
import { createAdminClient } from '@/lib/supabase/admin';

// Grok structured generation can take several seconds; the default Node runtime
// (not Edge) is required for the service-role Supabase client.
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  // Auth: the Supabase Database Webhook sends a shared secret. Mirrors the
  // CRON_SECRET pattern used by /api/daily-stats, but a distinct secret so the
  // webhook isn't conflated with the cron.
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CALL_SUMMARY_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  let id: string | undefined;
  try {
    const body = await request.json();
    id = typeof body?.id === 'string' ? body.id : undefined;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!id) {
    return NextResponse.json(
      { error: 'Missing call session id' },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();

  const { data: session, error: selectError } = await supabase
    .from('call_sessions')
    .select('id, status, transcript, analysis_status')
    .eq('id', id)
    .single();

  if (selectError || !session) {
    return NextResponse.json(
      { error: 'Call session not found' },
      { status: 404 },
    );
  }

  // Idempotency / sanity guards. Webhooks and the backfill sweep can both fire,
  // so a no-op (200) is the correct response when there's nothing to do.
  const transcriptLength = Array.isArray(session.transcript)
    ? session.transcript.length
    : 0;
  if (
    session.status !== 'completed' ||
    transcriptLength === 0 ||
    session.analysis_status === 'done'
  ) {
    return NextResponse.json({ skipped: true });
  }

  // Claim the row so concurrent fires don't double-process.
  await supabase
    .from('call_sessions')
    .update({ analysis_status: 'pending' })
    .eq('id', id);

  try {
    const analysis = await summarizeCall(session.transcript);

    const { error: updateError } = await supabase
      .from('call_sessions')
      .update({
        analysis,
        analysis_status: 'done',
        analysis_generated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Call summarization error:', error);
    Sentry.captureException(error, { extra: { callSessionId: id } });

    await supabase
      .from('call_sessions')
      .update({ analysis_status: 'error' })
      .eq('id', id);

    return NextResponse.json(
      { error: 'Failed to summarize call' },
      { status: 500 },
    );
  }
}
