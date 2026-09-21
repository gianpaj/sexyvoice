// biome-ignore lint/performance/noNamespaceImport: keep Sentry imports consistent with its Next.js integration
import * as Sentry from '@sentry/nextjs';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import {
  buildCallAnalysisPrompt,
  type CallSessionForAnalysis,
} from '@/lib/ai/analyze-call';
import {
  type CallAnalysisBatchContext,
  collectCallAnalysisBatchResults,
  createCallAnalysisBatch,
  prepareCallAnalysisBatch,
} from '@/lib/ai/call-analysis-batch';
import {
  getBatchState,
  isBatchSettled,
  waitForBatch,
} from '@/lib/ai/xai-batch';
import { APIErrorResponse } from '@/lib/error-ts';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  claimPendingCallAnalyses,
  getAnalyzedSessionIds,
  getInFlightCallAnalysisBatches,
  getPendingCallAnalyses,
  getSubmittedCallAnalysesForBatch,
  MAX_CALL_ANALYSIS_ATTEMPTS,
  markCallAnalysesCompleted,
  markCallAnalysisFailed,
  type QueuedCallSession,
  releaseCallAnalysisClaims,
  releaseStaleCallAnalysisClaims,
  setCallAnalysisBatchId,
  upsertCallSessionAnalysis,
} from '@/lib/supabase/call-analysis-queries';
import type { TypedSupabaseClient } from '@/lib/supabase/client';

/**
 * Cron drain for the call analysis queue (see vercel.json).
 *
 * Each run:
 *   1. Reconciles in-flight xAI batches: settled batches are collected and
 *      written to call_session_analysis; unsettled ones are left for the next
 *      run (and flagged in Sentry once they look stuck).
 *   2. Coalesces pending queue rows into one new xAI batch and, while the time
 *      budget allows, waits for it so small batches land within the same run.
 *
 * Analysis latency is therefore async and best-effort: typically minutes, but
 * bounded only by xAI batch processing plus the cron interval.
 */
export const runtime = 'nodejs';
export const maxDuration = 300;

/** Upper bound on sessions coalesced into one xAI batch per run. */
const MAX_SESSIONS_PER_BATCH = 200;
/** How long a run waits for the batch it just submitted before handing off. */
const POLL_BUDGET_MS = 150_000;
/** In-flight batches older than this are reported to Sentry as stuck. */
const STALE_BATCH_MS = 24 * 60 * 60 * 1000;
/**
 * A claim without a batch id older than this belongs to a run that died
 * between claiming rows and recording the batch; it is safely re-queued.
 * Must exceed `maxDuration` so a live run's claims are never recycled.
 */
const STALE_CLAIM_MS = 15 * 60 * 1000;

interface SettleSummary {
  batchId: string;
  completed: number;
  failed: number;
  retried: number;
}

function toSession(row: QueuedCallSession): CallSessionForAnalysis | null {
  return row.call_sessions;
}

function toContext(session: CallSessionForAnalysis): CallAnalysisBatchContext {
  return {
    assistantOnlyNote:
      buildCallAnalysisPrompt(session)?.assistantOnlyNote ?? null,
    session,
  };
}

/** Collect a settled batch and update queue + analysis rows accordingly. */
async function settleBatch(
  supabase: TypedSupabaseClient,
  batchId: string,
): Promise<SettleSummary> {
  const rows = await getSubmittedCallAnalysesForBatch(supabase, batchId);
  const summary: SettleSummary = {
    batchId,
    completed: 0,
    failed: 0,
    retried: 0,
  };

  const contexts = new Map<string, CallAnalysisBatchContext>();
  const attemptsBySession = new Map<string, number>();
  for (const row of rows) {
    const session = toSession(row);
    attemptsBySession.set(row.session_id, row.attempts);
    if (session) {
      contexts.set(session.id, toContext(session));
    }
  }

  const results = await collectCallAnalysisBatchResults(batchId, contexts);
  const completed: string[] = [];

  for (const result of results) {
    const context = contexts.get(result.sessionId);
    if (result.analysis && context) {
      await upsertCallSessionAnalysis(
        supabase,
        context.session,
        result.analysis,
      );
      completed.push(result.sessionId);
      continue;
    }

    const attempts = attemptsBySession.get(result.sessionId) ?? 0;
    const status = await markCallAnalysisFailed(
      supabase,
      result.sessionId,
      result.error ?? 'Unknown batch failure',
      { retry: attempts < MAX_CALL_ANALYSIS_ATTEMPTS },
    );
    if (status === 'pending') {
      summary.retried += 1;
    } else {
      summary.failed += 1;
    }
  }

  // Rows whose session vanished (cascade) or had no context get no result.
  for (const row of rows) {
    if (!contexts.has(row.session_id)) {
      await markCallAnalysisFailed(
        supabase,
        row.session_id,
        'Call session no longer available',
        { retry: false },
      );
      summary.failed += 1;
    }
  }

  await markCallAnalysesCompleted(supabase, completed);
  summary.completed = completed.length;
  return summary;
}

async function reconcileInFlightBatches(supabase: TypedSupabaseClient) {
  const settled: SettleSummary[] = [];
  const pending: string[] = [];

  const recycled = await releaseStaleCallAnalysisClaims(
    supabase,
    new Date(Date.now() - STALE_CLAIM_MS),
  );
  if (recycled.length > 0) {
    Sentry.captureMessage('Recycled call analysis claims without a batch id', {
      extra: { sessionIds: recycled },
      level: 'warning',
    });
  }

  for (const batch of await getInFlightCallAnalysisBatches(supabase)) {
    const state = await getBatchState(batch.batchId);
    if (isBatchSettled(state)) {
      settled.push(await settleBatch(supabase, batch.batchId));
      continue;
    }

    pending.push(batch.batchId);
    const submittedAt = batch.submittedAt ? Date.parse(batch.submittedAt) : 0;
    if (submittedAt && Date.now() - submittedAt > STALE_BATCH_MS) {
      Sentry.captureMessage('Call analysis batch appears stuck', {
        extra: {
          batchId: batch.batchId,
          state,
          submittedAt: batch.submittedAt,
        },
        level: 'warning',
      });
    }
  }

  return { pending, recycled: recycled.length, settled };
}

async function submitPending(supabase: TypedSupabaseClient) {
  const rows = await getPendingCallAnalyses(supabase, MAX_SESSIONS_PER_BATCH);
  if (rows.length === 0) {
    return { batchId: null, sessions: 0, settled: null, skipped: 0 };
  }

  // The backfill script (or a realtime bypass) may already have analysed some
  // queued sessions; close those rows without spending batch requests.
  const alreadyAnalyzed = await getAnalyzedSessionIds(
    supabase,
    rows.map((row) => row.session_id),
  );
  await markCallAnalysesCompleted(supabase, [...alreadyAnalyzed]);

  const candidates = rows.filter((row) => !alreadyAnalyzed.has(row.session_id));
  const sessions = candidates
    .map(toSession)
    .filter((session): session is CallSessionForAnalysis => session !== null);

  const prepared = prepareCallAnalysisBatch(sessions);
  for (const rejected of prepared.rejected) {
    await markCallAnalysisFailed(
      supabase,
      rejected.sessionId,
      rejected.error ?? 'Unusable transcript',
      { retry: false },
    );
  }
  const skipped = alreadyAnalyzed.size + prepared.rejected.length;

  // Claim before doing any paid external work: the compare-and-set on
  // `status = 'pending'` means an overlapping run cannot submit the same
  // rows, and a crash after this point leaves a claim that reconcile recycles
  // instead of a pending row that would be resubmitted (and billed) again.
  const claimed = await claimPendingCallAnalyses(
    supabase,
    candidates.filter((row) => prepared.contexts.has(row.session_id)),
  );
  const claimedSet = new Set(claimed);
  const requests = prepared.requests.filter((request) =>
    claimedSet.has(request.custom_id),
  );
  if (requests.length === 0) {
    return { batchId: null, sessions: 0, settled: null, skipped };
  }

  let batchId: string;
  try {
    batchId = await createCallAnalysisBatch(requests);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await releaseCallAnalysisClaims(supabase, claimed, message);
    throw error;
  }
  await setCallAnalysisBatchId(supabase, claimed, batchId);

  // Small batches usually settle within a couple of minutes; wait while the
  // function budget allows so results land in this run. Otherwise the next
  // run's reconcile step picks the batch up.
  const { settled } = await waitForBatch(batchId, {
    timeoutMs: POLL_BUDGET_MS,
  });

  return {
    batchId,
    sessions: requests.length,
    settled: settled ? await settleBatch(supabase, batchId) : null,
    skipped,
  };
}

export async function GET(request: NextRequest) {
  // Vercel cron sends `Authorization: Bearer $CRON_SECRET`. Fail closed when
  // the secret is unset: otherwise a literal `Bearer undefined` would match and
  // anyone could start paid xAI batches. Local development skips auth like
  // /api/daily-stats does.
  if (process.env.NODE_ENV === 'production') {
    const secret = process.env.CRON_SECRET;
    if (!secret) {
      Sentry.captureMessage('CRON_SECRET is not configured');
      return APIErrorResponse('Server misconfigured', 500);
    }
    if (request.headers.get('authorization') !== `Bearer ${secret}`) {
      return APIErrorResponse('Unauthorized', 401);
    }
  }

  const supabase = createAdminClient();

  try {
    const reconciled = await reconcileInFlightBatches(supabase);
    const submitted = await submitPending(supabase);
    const summary = { reconciled, submitted };
    console.log('Call analysis batch drain:', JSON.stringify(summary));
    return NextResponse.json(summary);
  } catch (error) {
    console.error('Call analysis batch drain error:', error);
    Sentry.captureException(error);
    return APIErrorResponse('Call analysis batch drain failed', 500);
  }
}
