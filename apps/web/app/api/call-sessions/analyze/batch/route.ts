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
  expireStaleCallAnalysisClaims,
  getAnalyzedSessionIds,
  getInFlightCallAnalysisBatches,
  getPendingCallAnalyses,
  getSubmittedCallAnalysesForBatch,
  MAX_CALL_ANALYSIS_ATTEMPTS,
  markCallAnalysesCompleted,
  markCallAnalysisFailed,
  type QueuedCallSession,
  releaseCallAnalysisClaims,
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
 * In-flight batches older than this are abandoned: their rows go back to
 * `pending` (bounded by `attempts`) so a batch cancelled or purged at xAI
 * cannot hold sessions in `submitted` forever.
 */
const ABANDON_BATCH_MS = 48 * 60 * 60 * 1000;
/**
 * A claim without a batch id older than this belongs to a run that died
 * between claiming rows and recording the batch. It is parked, not re-queued
 * (the batch may exist and be billed). Must exceed `maxDuration` so a live
 * run's claims are never touched.
 */
const STALE_CLAIM_MS = 15 * 60 * 1000;
/**
 * Retry schedule for the write that attaches the batch id right after the
 * paid xAI call: losing that id would orphan a billed batch.
 */
const BATCH_ID_WRITE_DELAYS_MS = [250, 1000, 4000];

interface SettleSummary {
  batchId: string;
  completed: number;
  failed: number;
  retried: number;
}

function toSession(row: QueuedCallSession): CallSessionForAnalysis | null {
  return row.call_sessions;
}

const SESSION_GONE_ERROR = 'Call session no longer available';

/** Per-run record of sessions that reached the terminal `failed` state. */
interface RunLog {
  parked: Array<{ error: string; sessionId: string }>;
}

/**
 * Record a failed attempt and remember terminal parks so the run can raise
 * them in Sentry: a parked session is otherwise only visible in the DB, and a
 * redelivered webhook cannot revive it (`enqueueCallAnalysis` ignores
 * duplicates), so someone has to know to run the backfill script.
 */
async function failSession(
  supabase: TypedSupabaseClient,
  run: RunLog,
  sessionId: string,
  error: string,
  retry: boolean,
) {
  const status = await markCallAnalysisFailed(supabase, sessionId, error, {
    retry,
  });
  if (status === 'failed') {
    run.parked.push({ error, sessionId });
  }
  return status;
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
  run: RunLog,
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
    const status = await failSession(
      supabase,
      run,
      result.sessionId,
      result.error ?? 'Unknown batch failure',
      attempts < MAX_CALL_ANALYSIS_ATTEMPTS,
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
      await failSession(
        supabase,
        run,
        row.session_id,
        SESSION_GONE_ERROR,
        false,
      );
      summary.failed += 1;
    }
  }

  await markCallAnalysesCompleted(supabase, completed);
  summary.completed = completed.length;
  return summary;
}

/** Give up on a batch that outlived ABANDON_BATCH_MS; rows retry via attempts. */
async function abandonBatch(
  supabase: TypedSupabaseClient,
  run: RunLog,
  batchId: string,
) {
  const rows = await getSubmittedCallAnalysesForBatch(supabase, batchId);
  for (const row of rows) {
    await failSession(
      supabase,
      run,
      row.session_id,
      `Batch ${batchId} did not settle within ${ABANDON_BATCH_MS / 3_600_000}h`,
      row.attempts < MAX_CALL_ANALYSIS_ATTEMPTS,
    );
  }
  return rows.length;
}

async function reconcileInFlightBatches(
  supabase: TypedSupabaseClient,
  run: RunLog,
) {
  const abandoned: string[] = [];
  const failed: string[] = [];
  const pending: string[] = [];
  const settled: SettleSummary[] = [];

  const expired = await expireStaleCallAnalysisClaims(
    supabase,
    new Date(Date.now() - STALE_CLAIM_MS),
  );
  for (const sessionId of expired) {
    run.parked.push({ error: 'Claim expired without a batch id', sessionId });
  }

  // Each batch is isolated: one batch whose state lookup keeps failing (an
  // expired id, a batch-specific 5xx) must not block reconciling the others
  // or, via GET, submitting new work.
  for (const batch of await getInFlightCallAnalysisBatches(supabase)) {
    const submittedAt = batch.submittedAt ? Date.parse(batch.submittedAt) : 0;
    const age = submittedAt ? Date.now() - submittedAt : 0;
    try {
      const state = await getBatchState(batch.batchId);
      if (isBatchSettled(state)) {
        settled.push(await settleBatch(supabase, run, batch.batchId));
        continue;
      }
      if (age > ABANDON_BATCH_MS) {
        await abandonBatch(supabase, run, batch.batchId);
        abandoned.push(batch.batchId);
        continue;
      }
      pending.push(batch.batchId);
      if (age > STALE_BATCH_MS) {
        Sentry.captureMessage('Call analysis batch appears stuck', {
          extra: {
            batchId: batch.batchId,
            state,
            submittedAt: batch.submittedAt,
          },
          level: 'warning',
        });
      }
    } catch (error) {
      console.error(
        `Call analysis batch ${batch.batchId} reconcile error:`,
        error,
      );
      Sentry.captureException(error, { extra: { batchId: batch.batchId } });
      if (age > ABANDON_BATCH_MS) {
        // Cannot even read its state any more; stop retrying it every run.
        await abandonBatch(supabase, run, batch.batchId).catch((abandonError) =>
          Sentry.captureException(abandonError, {
            extra: { batchId: batch.batchId },
          }),
        );
        abandoned.push(batch.batchId);
      } else {
        failed.push(batch.batchId);
      }
    }
  }

  return {
    abandoned,
    expiredClaims: expired.length,
    failed,
    pending,
    settled,
  };
}

/**
 * Attach the batch id to the claimed rows. The batch already exists and is
 * billed at this point, so the write is retried; if it still fails the claims
 * are deliberately left in place (an expired claim parks, it never resubmits)
 * and a Sentry error carries everything needed to attach the id by hand.
 */
async function recordBatchId(
  supabase: TypedSupabaseClient,
  rows: Pick<QueuedCallSession, 'attempts' | 'session_id'>[],
  batchId: string,
) {
  const sessionIds = rows.map((row) => row.session_id);
  for (let attempt = 0; ; attempt++) {
    try {
      await setCallAnalysisBatchId(supabase, rows, batchId);
      return;
    } catch (error) {
      const delay = BATCH_ID_WRITE_DELAYS_MS[attempt];
      if (delay === undefined) {
        Sentry.captureException(error, {
          extra: { batchId, sessionIds },
          level: 'error',
          tags: { call_analysis: 'batch_id_write_failed' },
        });
        throw new Error(
          `xAI batch ${batchId} was created but its id could not be recorded for ${sessionIds.length} session(s); attach it manually before the claims expire`,
          { cause: error },
        );
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

async function submitPending(supabase: TypedSupabaseClient, run: RunLog) {
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
  const sessions: CallSessionForAnalysis[] = [];
  let gone = 0;
  for (const row of candidates) {
    const session = toSession(row);
    if (session) {
      sessions.push(session);
      continue;
    }
    // The FK cascade should make this impossible, but a row with no session
    // would otherwise stay pending and be re-selected (FIFO) on every run.
    await failSession(supabase, run, row.session_id, SESSION_GONE_ERROR, false);
    gone += 1;
  }

  const prepared = prepareCallAnalysisBatch(sessions);
  for (const rejected of prepared.rejected) {
    await failSession(
      supabase,
      run,
      rejected.sessionId,
      rejected.error ?? 'Unusable transcript',
      false,
    );
  }
  const skipped = alreadyAnalyzed.size + prepared.rejected.length + gone;

  // Claim before doing any paid external work: the compare-and-set on
  // `status = 'pending'` means an overlapping run cannot submit the same
  // rows, and a crash after this point leaves a claim that reconcile recycles
  // instead of a pending row that would be resubmitted (and billed) again.
  const claimed = await claimPendingCallAnalyses(
    supabase,
    candidates
      .filter((row) => prepared.contexts.has(row.session_id))
      .map((row) => row.session_id),
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
  await recordBatchId(
    supabase,
    candidates.filter((row) => claimedSet.has(row.session_id)),
    batchId,
  );

  // Small batches usually settle within a couple of minutes; wait while the
  // function budget allows so results land in this run. Otherwise the next
  // run's reconcile step picks the batch up.
  const { settled } = await waitForBatch(batchId, {
    timeoutMs: POLL_BUDGET_MS,
  });

  return {
    batchId,
    sessions: requests.length,
    settled: settled ? await settleBatch(supabase, run, batchId) : null,
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
  const run: RunLog = { parked: [] };

  // The two phases fail independently so a reconcile error never stops new
  // sessions from being submitted (and vice versa).
  const reconciled = await reconcileInFlightBatches(supabase, run).then(
    (result) => ({ error: null, result }),
    (error: unknown) => {
      console.error('Call analysis batch reconcile error:', error);
      Sentry.captureException(error, { extra: { phase: 'reconcile' } });
      return { error: 'Reconcile failed', result: null };
    },
  );
  const submitted = await submitPending(supabase, run).then(
    (result) => ({ error: null, result }),
    (error: unknown) => {
      console.error('Call analysis batch submit error:', error);
      Sentry.captureException(error, { extra: { phase: 'submit' } });
      return { error: 'Submit failed', result: null };
    },
  );

  if (run.parked.length > 0) {
    // Terminal failures need a human: the backfill script is the only way
    // these sessions get analysed now.
    Sentry.captureMessage('Call analysis sessions parked as failed', {
      extra: { parked: run.parked },
      level: 'warning',
    });
  }

  const summary = { parked: run.parked.length, reconciled, submitted };
  console.log('Call analysis batch drain:', JSON.stringify(summary));
  if (reconciled.error || submitted.error) {
    return NextResponse.json(summary, { status: 500 });
  }
  return NextResponse.json(summary);
}
