import type { SupabaseClient } from '@supabase/supabase-js';

import {
  type CallAnalysis,
  type CallSessionForAnalysis,
  toAnalysisRow,
} from './analyze-call.ts';

// Shared with `scripts/` via Node's native type stripping: keep relative
// imports extension-qualified and avoid `@/` aliases in this module.

/**
 * The call analysis queue, `call_analysis_queue`, for every engine: the
 * webhook, the cron drain and the analysis scripts.
 *
 * A row is `pending` until the cron claims it for a batch (`submitted`), then
 * `completed` once an analysis is stored. `attempts` counts analyses that came
 * back failed. A retryable failure returns the row to `pending`, so the cron
 * retries it, until `MAX_CALL_ANALYSIS_ATTEMPTS`; a final failure, or the
 * last attempt, parks it as `failed`. Nothing retries a `failed` row on its
 * own: `backfill-call-analysis --retry-failed` reprocesses parked sessions.
 * A failure never writes a call_session_analysis row.
 */

type Client = SupabaseClient<Database>;

export const MAX_CALL_ANALYSIS_ATTEMPTS = 3;

/** The call_sessions columns an analysis reads. */
export const CALL_ANALYSIS_SESSION_COLUMNS =
  'id, user_id, started_at, duration_seconds, end_reason, transcript';

export type QueuedCallSession = Pick<
  Tables<'call_analysis_queue'>,
  'attempts' | 'session_id' | 'submitted_at' | 'xai_batch_id'
> & { call_sessions: CallSessionForAnalysis | null };

const QUEUE_WITH_SESSION = `session_id, attempts, submitted_at, xai_batch_id, call_sessions(${CALL_ANALYSIS_SESSION_COLUMNS})`;

/**
 * PostgREST `in.(...)` filters are sent in the query string; 200 UUIDs is
 * about 7.5 KB, close to the usual 8 KB request-line limit. Keep every id
 * list well under that.
 */
const IN_FILTER_CHUNK_SIZE = 50;

function chunk<T>(items: T[]): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += IN_FILTER_CHUNK_SIZE) {
    chunks.push(items.slice(i, i + IN_FILTER_CHUNK_SIZE));
  }
  return chunks;
}

const nowIso = () => new Date().toISOString();

function check(error: unknown) {
  if (error) throw error;
}

/**
 * Records intent to analyse a session. Idempotent: the primary key on
 * session_id plus `ignoreDuplicates` makes duplicate webhook deliveries a
 * no-op, and a row in any state is left untouched.
 */
export async function enqueueCallAnalysis(client: Client, sessionId: string) {
  const { error } = await client
    .from('call_analysis_queue')
    .upsert(
      { session_id: sessionId },
      { ignoreDuplicates: true, onConflict: 'session_id' },
    );
  check(error);
}

/** Oldest pending rows first, joined with their sessions. */
export async function getPendingCallAnalyses(
  client: Client,
  limit: number,
): Promise<QueuedCallSession[]> {
  const { data, error } = await client
    .from('call_analysis_queue')
    .select(QUEUE_WITH_SESSION)
    .eq('status', 'pending')
    .order('queued_at', { ascending: true })
    .limit(limit);
  check(error);
  return (data ?? []) as QueuedCallSession[];
}

interface InFlightCallAnalysisBatch {
  batchId: string;
  /** Earliest submission in the batch; used to flag stuck batches. */
  submittedAt: string | null;
}

/** Distinct xAI batch ids that still have submitted (unsettled) rows. */
export async function getInFlightCallAnalysisBatches(
  client: Client,
): Promise<InFlightCallAnalysisBatch[]> {
  const { data, error } = await client
    .from('call_analysis_queue')
    .select('xai_batch_id, submitted_at')
    .eq('status', 'submitted')
    .not('xai_batch_id', 'is', null)
    .order('submitted_at', { ascending: true });
  check(error);

  const batches = new Map<string, InFlightCallAnalysisBatch>();
  for (const row of data ?? []) {
    if (row.xai_batch_id && !batches.has(row.xai_batch_id)) {
      batches.set(row.xai_batch_id, {
        batchId: row.xai_batch_id,
        submittedAt: row.submitted_at,
      });
    }
  }
  return [...batches.values()];
}

/** Submitted rows of one batch, joined with their sessions. */
export async function getSubmittedCallAnalysesForBatch(
  client: Client,
  batchId: string,
): Promise<QueuedCallSession[]> {
  const { data, error } = await client
    .from('call_analysis_queue')
    .select(QUEUE_WITH_SESSION)
    .eq('status', 'submitted')
    .eq('xai_batch_id', batchId);
  check(error);
  return (data ?? []) as QueuedCallSession[];
}

/**
 * Claims pending rows for a batch that is about to be created. The rows move
 * to `submitted` with no batch id yet, guarded by `status = 'pending'` so two
 * overlapping runs can never submit the same session twice: only the rows
 * this call flipped are returned.
 */
export async function claimPendingCallAnalyses(
  client: Client,
  sessionIds: string[],
): Promise<string[]> {
  const timestamp = nowIso();
  const claimed: string[] = [];
  for (const ids of chunk(sessionIds)) {
    const { data, error } = await client
      .from('call_analysis_queue')
      .update({
        last_error: null,
        status: 'submitted',
        submitted_at: timestamp,
        updated_at: timestamp,
        xai_batch_id: null,
      })
      .eq('status', 'pending')
      .in('session_id', ids)
      .select('session_id');
    check(error);
    claimed.push(...(data ?? []).map((row) => row.session_id));
  }
  return claimed;
}

/**
 * Attaches the xAI batch id to claimed rows. The guard on `submitted` and a
 * null batch id makes a retried call idempotent and enforces the claim.
 */
export async function setCallAnalysisBatchId(
  client: Client,
  sessionIds: string[],
  batchId: string,
) {
  const timestamp = nowIso();
  for (const ids of chunk(sessionIds)) {
    const { error } = await client
      .from('call_analysis_queue')
      .update({ updated_at: timestamp, xai_batch_id: batchId })
      .eq('status', 'submitted')
      .is('xai_batch_id', null)
      .in('session_id', ids);
    check(error);
  }
}

/**
 * Returns claimed rows to `pending` when the batch could not be created. It
 * is not an analysis failure, so no attempt is counted.
 */
export async function releaseCallAnalysisClaims(
  client: Client,
  sessionIds: string[],
  lastError: string,
) {
  const timestamp = nowIso();
  for (const ids of chunk(sessionIds)) {
    const { error } = await client
      .from('call_analysis_queue')
      .update({
        last_error: lastError,
        status: 'pending',
        submitted_at: null,
        updated_at: timestamp,
      })
      .in('session_id', ids)
      .eq('status', 'submitted')
      .is('xai_batch_id', null);
    check(error);
  }
}

/**
 * Parks claims that never received a batch id: the run died between the
 * claim and `setCallAnalysisBatchId`, or that write kept failing. The batch
 * may exist and be billed, so they are parked rather than re-queued. Only
 * claims older than `olderThan` are touched, so a run in progress keeps its
 * rows.
 */
export async function expireStaleCallAnalysisClaims(
  client: Client,
  olderThan: Date,
): Promise<string[]> {
  const { data, error } = await client
    .from('call_analysis_queue')
    .update({
      last_error:
        'Claim expired before a batch id was recorded; attach the id from Sentry or run backfill-call-analysis --retry-failed',
      status: 'failed',
      updated_at: nowIso(),
    })
    .eq('status', 'submitted')
    .is('xai_batch_id', null)
    .lt('submitted_at', olderThan.toISOString())
    .select('session_id');
  check(error);
  return (data ?? []).map((row) => row.session_id);
}

/** Marks rows completed. Sessions without a queue row are skipped. */
export async function markCallAnalysesCompleted(
  client: Client,
  sessionIds: string[],
) {
  const timestamp = nowIso();
  for (const ids of chunk(sessionIds)) {
    const { error } = await client
      .from('call_analysis_queue')
      .update({
        completed_at: timestamp,
        last_error: null,
        status: 'completed',
        updated_at: timestamp,
      })
      .in('session_id', ids);
    check(error);
  }
}

/** The status a failed analysis leaves its row in. */
function statusAfterFailure(attempts: number, final: boolean) {
  return final || attempts >= MAX_CALL_ANALYSIS_ATTEMPTS ? 'failed' : 'pending';
}

/**
 * Counts a failed analysis of a queued row. The row keeps its batch id so a
 * parked row still points at the batch to inspect.
 */
export async function recordCallAnalysisFailure(
  client: Client,
  row: Pick<QueuedCallSession, 'attempts' | 'session_id'>,
  lastError: string,
  { final = false }: { final?: boolean } = {},
): Promise<'failed' | 'pending'> {
  const attempts = row.attempts + 1;
  const status = statusAfterFailure(attempts, final);
  const { error } = await client
    .from('call_analysis_queue')
    .update({ attempts, last_error: lastError, status, updated_at: nowIso() })
    .eq('session_id', row.session_id);
  check(error);
  return status;
}

/** Session ids (from `sessionIds`) that already have an analysis row. */
export async function getAnalyzedSessionIds(
  client: Client,
  sessionIds: string[],
): Promise<Set<string>> {
  const analyzed = new Set<string>();
  for (const ids of chunk(sessionIds)) {
    const { data, error } = await client
      .from('call_session_analysis')
      .select('session_id')
      .in('session_id', ids);
    check(error);
    for (const row of data ?? []) {
      analyzed.add(row.session_id);
    }
  }
  return analyzed;
}

export async function hasCallSessionAnalysis(
  client: Client,
  sessionId: string,
): Promise<boolean> {
  const { count, error } = await client
    .from('call_session_analysis')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', sessionId);
  check(error);
  return (count ?? 0) > 0;
}

/**
 * Persists a successful analysis. The unique session_id constraint is the
 * source of truth: `ignoreDuplicates` closes the race when the webhook
 * bypass, the cron and the scripts run concurrently.
 */
export async function saveCallSessionAnalysis(
  client: Client,
  session: CallSessionForAnalysis,
  analysis: CallAnalysis,
) {
  const { error } = await client
    .from('call_session_analysis')
    .upsert(toAnalysisRow(session, analysis), {
      ignoreDuplicates: true,
      onConflict: 'session_id',
    });
  check(error);
}

/** Sessions parked as `failed`, which the scripts skip by default. */
export async function getParkedSessionIds(client: Client) {
  const { data, error } = await client
    .from('call_analysis_queue')
    .select('session_id')
    .eq('status', 'failed');
  check(error);
  return new Set((data ?? []).map((row) => row.session_id));
}

interface CallAnalysisOutcome {
  analysis?: CallAnalysis;
  error?: string;
  /** No retry can succeed, such as a transcript without messages. */
  final?: boolean;
  session: CallSessionForAnalysis;
}

/**
 * Records the analyses a script run produced: saves the successful ones and
 * completes their queue rows, and counts each failure against its row. Rows
 * the cron holds (`pending`, `submitted`) and completed rows keep their
 * state; a failure without a queue row starts one.
 */
export async function recordCallAnalysisOutcomes(
  client: Client,
  outcomes: CallAnalysisOutcome[],
) {
  let saved = 0;
  let saveErrors = 0;
  const completed: string[] = [];
  for (const { analysis, session } of outcomes) {
    if (!analysis) continue;
    try {
      await saveCallSessionAnalysis(client, session, analysis);
      completed.push(session.id);
      saved += 1;
    } catch (error) {
      console.error(
        `Failed to save the analysis of session ${session.id}:`,
        error,
      );
      saveErrors += 1;
    }
  }
  await markCallAnalysesCompleted(client, completed);

  const failures = outcomes.filter(({ analysis }) => !analysis);
  const rows = new Map<string, { attempts: number; status: string }>();
  for (const ids of chunk(failures.map(({ session }) => session.id))) {
    const { data, error } = await client
      .from('call_analysis_queue')
      .select('session_id, status, attempts')
      .in('session_id', ids);
    check(error);
    for (const row of data ?? []) rows.set(row.session_id, row);
  }

  const timestamp = nowIso();
  const updates = failures
    .filter(({ session }) => {
      const status = rows.get(session.id)?.status;
      return status === undefined || status === 'failed';
    })
    .map(({ error, final = false, session }) => {
      const attempts = (rows.get(session.id)?.attempts ?? 0) + 1;
      return {
        attempts,
        last_error: error || 'Empty analysis',
        session_id: session.id,
        status: statusAfterFailure(attempts, final),
        updated_at: timestamp,
      };
    });
  if (updates.length > 0) {
    const { error } = await client
      .from('call_analysis_queue')
      .upsert(updates, { onConflict: 'session_id' });
    check(error);
  }

  return {
    failed: failures.length,
    parked: updates.filter(({ status }) => status === 'failed').length,
    saveErrors,
    saved,
  };
}
