import type { SupabaseClient } from '@supabase/supabase-js';

import type { DailyStatsProfileRelation } from './types';
import {
  applyPageCursor,
  fetchAllPages,
  formatIdList,
  PAGE_SIZE,
} from './utils';

const VOICE_CLONING_MODELS = [
  'resemble-ai/chatterbox-multilingual',
  'resemble-ai/chatterbox',
  'voxtral-mini-tts-2603',
] as const;

// Internal users excluded from daily stats aggregations.
export const INTERNAL_USER_EMAILS = [
  'gianpa@gmail.com',
  'alex.kostinskyi@gmail.com',
] as const;

export type DailyStatsCreditTransaction = Pick<
  Tables<'credit_transactions'>,
  | 'amount'
  | 'created_at'
  | 'description'
  | 'id'
  | 'metadata'
  | 'type'
  | 'user_id'
> & { profiles: DailyStatsProfileRelation };

// No `profiles(username)` embed: PostgREST joins that per row, and the report
// only labels three users. See getProfileUsernamesByIds.
export type DailyStatsUsageEvent = Pick<
  Tables<'usage_events'>,
  'credits_used' | 'id' | 'occurred_at' | 'source_type' | 'user_id'
>;

export type DailyStatsAudioFile = Pick<
  Tables<'audio_files'>,
  'created_at' | 'id' | 'model'
>;
export type DailyStatsProfile = Pick<
  Tables<'profiles'>,
  'created_at' | 'id' | 'username'
>;
// `id` and `started_at` are not reported on; they carry the keyset cursor.
export type DailyStatsCallSessionDuration = Pick<
  Tables<'call_sessions'>,
  'duration_seconds' | 'id' | 'started_at'
>;

type DailyStatsSupabaseClient = SupabaseClient;

export async function getInternalUserIds(
  supabase: DailyStatsSupabaseClient,
): Promise<string[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .in('username', [...INTERNAL_USER_EMAILS]);
  if (error) throw error;
  return ((data ?? []) as { id: string }[]).map((row) => row.id);
}

export function getUsageEventsInRange(
  supabase: DailyStatsSupabaseClient,
  start: Date,
  end: Date,
  excludeUserIds: readonly string[] = [],
): Promise<DailyStatsUsageEvent[]> {
  return fetchAllPages<DailyStatsUsageEvent>('occurred_at', (cursor) => {
    let query = supabase
      .from('usage_events')
      .select('id, user_id, source_type, credits_used, occurred_at')
      .gte('occurred_at', start.toISOString())
      .lt('occurred_at', end.toISOString());
    if (excludeUserIds.length > 0) {
      query = query.notIn('user_id', excludeUserIds);
    }
    return applyPageCursor(query, cursor)
      .order('occurred_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(PAGE_SIZE)
      .then(({ data, error }) => ({
        data: (data as DailyStatsUsageEvent[] | null) ?? null,
        error,
      }));
  });
}

export function getAudioFilesInRange(
  supabase: DailyStatsSupabaseClient,
  start: Date,
  end: Date,
  excludeUserIds: readonly string[] = [],
): Promise<DailyStatsAudioFile[]> {
  return fetchAllPages<DailyStatsAudioFile>('created_at', (cursor) => {
    let query = supabase
      .from('audio_files')
      .select('id, created_at, model')
      .gte('created_at', start.toISOString())
      .lt('created_at', end.toISOString());
    // audio_files.user_id is nullable — keep NULL rows (not internal users).
    if (excludeUserIds.length > 0) {
      query = query.or(
        `user_id.is.null,user_id.not.in.${formatIdList(excludeUserIds)}`,
      );
    }
    return applyPageCursor(query, cursor)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(PAGE_SIZE)
      .then(({ data, error }) => ({
        data: (data as DailyStatsAudioFile[] | null) ?? null,
        error,
      }));
  });
}

export function getClonedAudioFilesInRange(
  supabase: DailyStatsSupabaseClient,
  start: Date,
  end: Date,
  excludeUserIds: readonly string[] = [],
): Promise<Array<{ created_at: string | null; id: string }>> {
  return fetchAllPages<{ created_at: string | null; id: string }>(
    'created_at',
    (cursor) => {
      let query = supabase
        .from('audio_files')
        .select('id, created_at')
        .in('model', [...VOICE_CLONING_MODELS])
        .gte('created_at', start.toISOString())
        .lt('created_at', end.toISOString());
      if (excludeUserIds.length > 0) {
        query = query.or(
          `user_id.is.null,user_id.not.in.${formatIdList(excludeUserIds)}`,
        );
      }
      return applyPageCursor(query, cursor)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .limit(PAGE_SIZE)
        .then(({ data, error }) => ({
          data:
            (data as Array<{ created_at: string | null; id: string }> | null) ??
            null,
          error,
        }));
    },
  );
}

export function getProfilesInRange(
  supabase: DailyStatsSupabaseClient,
  start: Date,
  end: Date,
  excludeUserIds: readonly string[] = [],
): Promise<DailyStatsProfile[]> {
  return fetchAllPages<DailyStatsProfile>('created_at', (cursor) => {
    let query = supabase
      .from('profiles')
      .select('id, created_at, username')
      .gte('created_at', start.toISOString())
      .lt('created_at', end.toISOString());
    if (excludeUserIds.length > 0) {
      query = query.notIn('id', excludeUserIds);
    }
    return applyPageCursor(query, cursor)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(PAGE_SIZE)
      .then(({ data, error }) => ({
        data: (data as DailyStatsProfile[] | null) ?? null,
        error,
      }));
  });
}

export function getCreditTransactionsInRange(
  supabase: DailyStatsSupabaseClient,
  start: Date,
  end: Date,
  excludeUserIds: readonly string[] = [],
): Promise<DailyStatsCreditTransaction[]> {
  return fetchAllPages<DailyStatsCreditTransaction>('created_at', (cursor) => {
    let query = supabase
      .from('credit_transactions')
      .select(
        'id, user_id, created_at, type, description, amount, metadata, profiles(username)',
      )
      .in('type', ['purchase', 'topup', 'refund'])
      .not('description', 'ilike', '%manual%')
      .gte('created_at', start.toISOString())
      .lt('created_at', end.toISOString());
    if (excludeUserIds.length > 0) {
      query = query.notIn('user_id', excludeUserIds);
    }
    return applyPageCursor(query, cursor)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(PAGE_SIZE)
      .then(({ data, error }) => ({
        data: (data as DailyStatsCreditTransaction[] | null) ?? null,
        error,
      }));
  });
}

export function getPurchaseTransactionsBefore(
  supabase: DailyStatsSupabaseClient,
  end: Date,
  excludeUserIds: readonly string[] = [],
): Promise<DailyStatsCreditTransaction[]> {
  return fetchAllPages<DailyStatsCreditTransaction>('created_at', (cursor) => {
    let query = supabase
      .from('credit_transactions')
      .select(
        'id, user_id, created_at, type, description, amount, metadata, profiles(username)',
      )
      .in('type', ['purchase', 'topup'])
      .not('description', 'ilike', '%manual%')
      .lt('created_at', end.toISOString());
    if (excludeUserIds.length > 0) {
      query = query.notIn('user_id', excludeUserIds);
    }
    return applyPageCursor(query, cursor)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(PAGE_SIZE)
      .then(({ data, error }) => ({
        data: (data as DailyStatsCreditTransaction[] | null) ?? null,
        error,
      }));
  });
}

export function getCallSessionDurationsBefore(
  supabase: DailyStatsSupabaseClient,
  end: Date,
  excludeUserIds: readonly string[] = [],
): Promise<DailyStatsCallSessionDuration[]> {
  return fetchAllPages<DailyStatsCallSessionDuration>(
    'started_at',
    (cursor) => {
      let query = supabase
        .from('call_sessions')
        .select('duration_seconds, id, started_at')
        .lt('started_at', end.toISOString());
      if (excludeUserIds.length > 0) {
        query = query.notIn('user_id', excludeUserIds);
      }
      return applyPageCursor(query, cursor)
        .order('started_at', { ascending: true })
        .order('id', { ascending: true })
        .limit(PAGE_SIZE)
        .then(({ data, error }) => ({
          data: (data as DailyStatsCallSessionDuration[] | null) ?? null,
          error,
        }));
    },
  );
}

export function getCallSessionsInRange(
  supabase: DailyStatsSupabaseClient,
  start: Date,
  end: Date,
  excludeUserIds: readonly string[] = [],
) {
  return fetchAllPages<
    Pick<
      Tables<'call_sessions'>,
      | 'id'
      | 'started_at'
      | 'duration_seconds'
      | 'credits_used'
      | 'status'
      | 'free_call'
    >
  >('started_at', (cursor) => {
    let query = supabase
      .from('call_sessions')
      .select(
        'id, started_at, duration_seconds, credits_used, status, free_call',
      )
      .gte('started_at', start.toISOString())
      .lt('started_at', end.toISOString());
    if (excludeUserIds.length > 0)
      query = query.notIn('user_id', excludeUserIds);
    return applyPageCursor(query, cursor)
      .order('started_at')
      .order('id')
      .limit(PAGE_SIZE);
  });
}

// Epoch sentinel for "all-time" reads so callers don't each spell out a date.
const ALL_TIME_START = new Date(0);

/**
 * Credit transactions before `end`, deduplicated by id and sorted
 * chronologically, using the same filters as {@link getCreditTransactionsInRange}.
 *
 * Daily stats slices this once in memory for each reporting window instead of
 * re-querying per period: the per-period ranges are subsets of this one, so
 * issuing them concurrently only multiplies PostgREST load.
 */
export async function getAllCreditTransactions(
  supabase: DailyStatsSupabaseClient,
  end: Date,
  excludeUserIds: readonly string[] = [],
): Promise<DailyStatsCreditTransaction[]> {
  const transactions = await getCreditTransactionsInRange(
    supabase,
    ALL_TIME_START,
    end,
    excludeUserIds,
  );

  // Keyset pagination has no shared snapshot across pages. Dedupe by id in
  // case a transaction's timestamp changes mid-read, then sort chronologically.
  return [
    ...new Map(
      transactions.map((transaction) => [transaction.id, transaction]),
    ).values(),
  ].sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
}

/**
 * Usernames for a handful of user ids.
 *
 * The report labels only its top few users, so it resolves them here instead of
 * embedding `profiles(username)` on every usage-event row, which makes PostgREST
 * join per row across the whole 14-day window.
 */
export async function getProfileUsernamesByIds(
  supabase: DailyStatsSupabaseClient,
  userIds: readonly string[],
): Promise<Map<string, string>> {
  if (userIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id, username')
    .in('id', [...new Set(userIds)]);
  if (error) throw error;

  return new Map(
    ((data ?? []) as { id: string; username: string | null }[]).flatMap(
      (row) => (row.username ? [[row.id, row.username] as const] : []),
    ),
  );
}
