import type {
  CallAnalysis,
  CallSessionForAnalysis,
} from '@/lib/ai/analyze-call';
import { toAnalysisRow } from '@/lib/ai/analyze-call';
import type { TypedSupabaseClient } from './client';

export type CallAnalysisQueueRow = Tables<'call_analysis_queue'>;
export type CallAnalysisQueueStatus =
  | 'completed'
  | 'failed'
  | 'pending'
  | 'submitted';

/** A batch submission that errors this many times is parked as `failed`. */
export const MAX_CALL_ANALYSIS_ATTEMPTS = 3;

const SESSION_COLUMNS =
  'id, user_id, started_at, duration_seconds, end_reason, transcript';

export type QueuedCallSession = Pick<
  CallAnalysisQueueRow,
  'attempts' | 'session_id' | 'submitted_at' | 'xai_batch_id'
> & {
  call_sessions: Pick<
    Tables<'call_sessions'>,
    | 'duration_seconds'
    | 'end_reason'
    | 'id'
    | 'started_at'
    | 'transcript'
    | 'user_id'
  > | null;
};

const QUEUE_WITH_SESSION = `session_id, attempts, submitted_at, xai_batch_id, call_sessions(${SESSION_COLUMNS})`;

/**
 * PostgREST `in.(...)` filters are sent in the query string; 200 UUIDs is
 * about 7.5 KB, close to the usual 8 KB request-line limit. Keep every id
 * list well under that regardless of MAX_SESSIONS_PER_BATCH.
 */
const IN_FILTER_CHUNK_SIZE = 50;

function chunk<T>(items: T[], size = IN_FILTER_CHUNK_SIZE): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function nowIso() {
  return new Date().toISOString();
}

/**
 * Record intent to analyse a session. Idempotent: the primary key on
 * session_id plus `ignoreDuplicates` makes duplicate webhook deliveries a
 * no-op, and a row that is already submitted/completed is left untouched.
 */
export async function enqueueCallAnalysis(
  client: TypedSupabaseClient,
  sessionId: string,
): Promise<void> {
  const { error } = await client
    .from('call_analysis_queue')
    .upsert(
      { session_id: sessionId },
      { ignoreDuplicates: true, onConflict: 'session_id' },
    );
  if (error) {
    throw error;
  }
}

/** Oldest pending rows first, joined with the session data the prompt needs. */
export async function getPendingCallAnalyses(
  client: TypedSupabaseClient,
  limit: number,
): Promise<QueuedCallSession[]> {
  const { data, error } = await client
    .from('call_analysis_queue')
    .select(QUEUE_WITH_SESSION)
    .eq('status', 'pending')
    .order('queued_at', { ascending: true })
    .limit(limit);
  if (error) {
    throw error;
  }
  return (data ?? []) as QueuedCallSession[];
}

export interface InFlightCallAnalysisBatch {
  batchId: string;
  /** Earliest submission in the batch; used to flag stuck batches. */
  submittedAt: string | null;
}

/** Distinct xAI batch ids that still have submitted (unsettled) rows. */
export async function getInFlightCallAnalysisBatches(
  client: TypedSupabaseClient,
): Promise<InFlightCallAnalysisBatch[]> {
  const { data, error } = await client
    .from('call_analysis_queue')
    .select('xai_batch_id, submitted_at')
    .eq('status', 'submitted')
    .not('xai_batch_id', 'is', null)
    .order('submitted_at', { ascending: true });
  if (error) {
    throw error;
  }

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
  client: TypedSupabaseClient,
  batchId: string,
): Promise<QueuedCallSession[]> {
  const { data, error } = await client
    .from('call_analysis_queue')
    .select(QUEUE_WITH_SESSION)
    .eq('status', 'submitted')
    .eq('xai_batch_id', batchId);
  if (error) {
    throw error;
  }
  return (data ?? []) as QueuedCallSession[];
}

/**
 * Claim pending rows for a batch that is about to be created. The rows move
 * to `submitted` with no batch id yet, guarded by `status = 'pending'` so two
 * overlapping runs can never submit the same session twice: only the rows
 * this call actually flipped are returned. `attempts` is deliberately not
 * bumped here; it counts batches xAI accepted (see `setCallAnalysisBatchId`),
 * so an upload outage cannot spend a session's analysis retry budget.
 */
export async function claimPendingCallAnalyses(
  client: TypedSupabaseClient,
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
    if (error) {
      throw error;
    }
    claimed.push(...(data ?? []).map((row) => row.session_id));
  }
  return claimed;
}

/**
 * Attach the xAI batch id to rows claimed by `claimPendingCallAnalyses` and
 * count the attempt: xAI has accepted the batch, so this submission is real.
 * PostgREST cannot express `attempts = attempts + 1`, so rows are grouped by
 * their current attempt count (normally a single group). The guard on
 * `submitted` + null batch id makes a retried call idempotent (rows already
 * stamped are skipped, never bumped twice) and enforces the claim invariant.
 */
export async function setCallAnalysisBatchId(
  client: TypedSupabaseClient,
  rows: Pick<QueuedCallSession, 'attempts' | 'session_id'>[],
  batchId: string,
): Promise<void> {
  const byAttempts = new Map<number, string[]>();
  for (const row of rows) {
    const ids = byAttempts.get(row.attempts) ?? [];
    ids.push(row.session_id);
    byAttempts.set(row.attempts, ids);
  }

  const timestamp = nowIso();
  for (const [attempts, sessionIds] of byAttempts) {
    for (const ids of chunk(sessionIds)) {
      const { error } = await client
        .from('call_analysis_queue')
        .update({
          attempts: attempts + 1,
          updated_at: timestamp,
          xai_batch_id: batchId,
        })
        .eq('status', 'submitted')
        .is('xai_batch_id', null)
        .in('session_id', ids);
      if (error) {
        throw error;
      }
    }
  }
}

/**
 * Return claimed rows to `pending` when the batch could not be created. No
 * attempt is charged: the failure is xAI's upload path, not the analysis, and
 * the submit phase reports it to Sentry on every run until it recovers.
 */
export async function releaseCallAnalysisClaims(
  client: TypedSupabaseClient,
  sessionIds: string[],
  lastError: string,
): Promise<void> {
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
    if (error) {
      throw error;
    }
  }
}

/**
 * Park claims that never received a batch id (the run died between the claim
 * and `setCallAnalysisBatchId`, or that write kept failing). They are parked
 * as `failed` rather than re-queued: the batch may already exist and be
 * billed, so an automatic resubmission could pay twice. An operator can attach
 * the id from the Sentry event or run the backfill script. Only claims older
 * than `olderThan` are touched so an in-progress run's rows are left alone.
 */
export async function expireStaleCallAnalysisClaims(
  client: TypedSupabaseClient,
  olderThan: Date,
): Promise<string[]> {
  const { data, error } = await client
    .from('call_analysis_queue')
    .update({
      last_error:
        'Claim expired before a batch id was recorded; attach the id from Sentry or run the backfill script',
      status: 'failed',
      updated_at: nowIso(),
    })
    .eq('status', 'submitted')
    .is('xai_batch_id', null)
    .lt('submitted_at', olderThan.toISOString())
    .select('session_id');
  if (error) {
    throw error;
  }
  return (data ?? []).map((row) => row.session_id);
}

export async function markCallAnalysesCompleted(
  client: TypedSupabaseClient,
  sessionIds: string[],
): Promise<void> {
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
    if (error) {
      throw error;
    }
  }
}

/**
 * Record a failed attempt. Retryable failures go back to `pending` so the next
 * drain run resubmits them; once `attempts` reaches the limit (or the failure
 * is final, e.g. an unusable transcript) the row is parked as `failed`. No
 * call_session_analysis row is written either way, so the backfill script can
 * still reprocess the session later.
 */
export async function markCallAnalysisFailed(
  client: TypedSupabaseClient,
  sessionId: string,
  lastError: string,
  { retry }: { retry: boolean },
): Promise<CallAnalysisQueueStatus> {
  const status: CallAnalysisQueueStatus = retry ? 'pending' : 'failed';
  const { error } = await client
    .from('call_analysis_queue')
    // Keep xai_batch_id so a failed row still points at the batch to inspect;
    // the next submission overwrites it.
    .update({
      last_error: lastError,
      status,
      updated_at: nowIso(),
    })
    .eq('session_id', sessionId);
  if (error) {
    throw error;
  }
  return status;
}

/** Session ids (from `sessionIds`) that already have an analysis row. */
export async function getAnalyzedSessionIds(
  client: TypedSupabaseClient,
  sessionIds: string[],
): Promise<Set<string>> {
  const analyzed = new Set<string>();
  for (const ids of chunk(sessionIds)) {
    const { data, error } = await client
      .from('call_session_analysis')
      .select('session_id')
      .in('session_id', ids);
    if (error) {
      throw error;
    }
    for (const row of data ?? []) {
      analyzed.add(row.session_id);
    }
  }
  return analyzed;
}

export async function hasCallSessionAnalysis(
  client: TypedSupabaseClient,
  sessionId: string,
): Promise<boolean> {
  const { count, error } = await client
    .from('call_session_analysis')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', sessionId);
  if (error) {
    throw error;
  }
  return (count ?? 0) > 0;
}

/**
 * Persist a successful analysis. The unique session_id constraint is the
 * source of truth: `ignoreDuplicates` closes the race when the webhook bypass,
 * the batch drain and the backfill script run concurrently.
 */
export async function upsertCallSessionAnalysis(
  client: TypedSupabaseClient,
  session: CallSessionForAnalysis,
  analysis: CallAnalysis,
): Promise<void> {
  const { error } = await client
    .from('call_session_analysis')
    .upsert(toAnalysisRow(session, analysis), {
      ignoreDuplicates: true,
      onConflict: 'session_id',
    });
  if (error) {
    throw error;
  }
}
