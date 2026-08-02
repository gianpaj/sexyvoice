import type { SupabaseClient } from '@supabase/supabase-js';

import type { DailyStatsProfileRelation } from './types';
import { fetchAllPages, PAGE_SIZE } from './utils';

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

export const formatIdList = (ids: readonly string[]) => `(${ids.join(',')})`;

export interface DailyStatsCreditTransaction {
  amount: number;
  created_at: string;
  description: string | null;
  id: string;
  metadata: Json;
  profiles: DailyStatsProfileRelation;
  type: Database['public']['Enums']['credit_transaction_type'];
  user_id: string;
}

export interface DailyStatsUsageEvent {
  credits_used: number;
  id: string;
  occurred_at: string;
  profiles: DailyStatsProfileRelation;
  source_type: string;
  user_id: string;
}

export interface DailyStatsAudioFile {
  created_at: string | null;
  id: string;
  model: string | null;
}

export interface DailyStatsProfile {
  created_at: string | null;
  id: string;
  username: string | null;
}

export interface DailyStatsCallSessionDuration {
  duration_seconds: number;
}

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
  return fetchAllPages<DailyStatsUsageEvent>((offset) => {
    let query = supabase
      .from('usage_events')
      .select(
        'id, user_id, source_type, credits_used, occurred_at, profiles(username)',
      )
      .gte('occurred_at', start.toISOString())
      .lt('occurred_at', end.toISOString());
    if (excludeUserIds.length > 0) {
      query = query.notIn('user_id', excludeUserIds);
    }
    return query
      .order('occurred_at', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)
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
  return fetchAllPages<DailyStatsAudioFile>((offset) => {
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
    return query
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)
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
  return fetchAllPages<{ created_at: string | null; id: string }>((offset) => {
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
    return query
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)
      .then(({ data, error }) => ({
        data:
          (data as Array<{ created_at: string | null; id: string }> | null) ??
          null,
        error,
      }));
  });
}

export function getProfilesInRange(
  supabase: DailyStatsSupabaseClient,
  start: Date,
  end: Date,
  excludeUserIds: readonly string[] = [],
): Promise<DailyStatsProfile[]> {
  return fetchAllPages<DailyStatsProfile>((offset) => {
    let query = supabase
      .from('profiles')
      .select('id, created_at, username')
      .gte('created_at', start.toISOString())
      .lt('created_at', end.toISOString());
    if (excludeUserIds.length > 0) {
      query = query.notIn('id', excludeUserIds);
    }
    return query
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)
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
  return fetchAllPages<DailyStatsCreditTransaction>((offset) => {
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
    return query
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)
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
  return fetchAllPages<DailyStatsCreditTransaction>((offset) => {
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
    return query
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)
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
  return fetchAllPages<DailyStatsCallSessionDuration>((offset) => {
    let query = supabase
      .from('call_sessions')
      .select('duration_seconds')
      .lt('started_at', end.toISOString());
    if (excludeUserIds.length > 0) {
      query = query.notIn('user_id', excludeUserIds);
    }
    return query
      .order('started_at', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)
      .then(({ data, error }) => ({
        data: (data as DailyStatsCallSessionDuration[] | null) ?? null,
        error,
      }));
  });
}
