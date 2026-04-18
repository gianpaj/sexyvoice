import type { SupabaseClient } from '@supabase/supabase-js';

import type { DailyStatsProfileRelation } from './types';
import { fetchAllPages, PAGE_SIZE } from './utils';

export const VOICE_CLONING_MODELS = [
  'resemble-ai/chatterbox-multilingual',
  'resemble-ai/chatterbox',
  'voxtral-mini-tts-2603',
] as const;

export interface DailyStatsCreditTransaction {
  amount: number;
  created_at: string;
  description: string | null;
  id: string;
  metadata: Json;
  profiles: DailyStatsProfileRelation;
  type: 'purchase' | 'freemium' | 'topup' | 'refund';
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

export function getUsageEventsInRange(
  supabase: DailyStatsSupabaseClient,
  start: Date,
  end: Date,
): Promise<DailyStatsUsageEvent[]> {
  return fetchAllPages<DailyStatsUsageEvent>((offset) =>
    supabase
      .from('usage_events')
      .select(
        'id, user_id, source_type, credits_used, occurred_at, profiles(username)',
      )
      .gte('occurred_at', start.toISOString())
      .lt('occurred_at', end.toISOString())
      .order('occurred_at', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)
      .then(({ data, error }) => ({
        data: (data as DailyStatsUsageEvent[] | null) ?? null,
        error,
      })),
  );
}

export function getAudioFilesInRange(
  supabase: DailyStatsSupabaseClient,
  start: Date,
  end: Date,
): Promise<DailyStatsAudioFile[]> {
  return fetchAllPages<DailyStatsAudioFile>((offset) =>
    supabase
      .from('audio_files')
      .select('id, created_at, model')
      .gte('created_at', start.toISOString())
      .lt('created_at', end.toISOString())
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)
      .then(({ data, error }) => ({
        data: (data as DailyStatsAudioFile[] | null) ?? null,
        error,
      })),
  );
}

export function getClonedAudioFilesInRange(
  supabase: DailyStatsSupabaseClient,
  start: Date,
  end: Date,
): Promise<Array<{ created_at: string | null; id: string }>> {
  return fetchAllPages<{ created_at: string | null; id: string }>((offset) =>
    supabase
      .from('audio_files')
      .select('id, created_at')
      .in('model', [...VOICE_CLONING_MODELS])
      .gte('created_at', start.toISOString())
      .lt('created_at', end.toISOString())
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)
      .then(({ data, error }) => ({
        data:
          (data as Array<{ created_at: string | null; id: string }> | null) ??
          null,
        error,
      })),
  );
}

export function getProfilesInRange(
  supabase: DailyStatsSupabaseClient,
  start: Date,
  end: Date,
): Promise<DailyStatsProfile[]> {
  return fetchAllPages<DailyStatsProfile>((offset) =>
    supabase
      .from('profiles')
      .select('id, created_at, username')
      .gte('created_at', start.toISOString())
      .lt('created_at', end.toISOString())
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)
      .then(({ data, error }) => ({
        data: (data as DailyStatsProfile[] | null) ?? null,
        error,
      })),
  );
}

export function getCreditTransactionsInRange(
  supabase: DailyStatsSupabaseClient,
  start: Date,
  end: Date,
): Promise<DailyStatsCreditTransaction[]> {
  return fetchAllPages<DailyStatsCreditTransaction>((offset) =>
    supabase
      .from('credit_transactions')
      .select(
        'id, user_id, created_at, type, description, amount, metadata, profiles(username)',
      )
      .in('type', ['purchase', 'topup', 'refund'])
      .not('description', 'ilike', '%manual%')
      .gte('created_at', start.toISOString())
      .lt('created_at', end.toISOString())
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)
      .then(({ data, error }) => ({
        data: (data as DailyStatsCreditTransaction[] | null) ?? null,
        error,
      })),
  );
}

export function getPurchaseTransactionsBefore(
  supabase: DailyStatsSupabaseClient,
  end: Date,
): Promise<DailyStatsCreditTransaction[]> {
  return fetchAllPages<DailyStatsCreditTransaction>((offset) =>
    supabase
      .from('credit_transactions')
      .select(
        'id, user_id, created_at, type, description, amount, metadata, profiles(username)',
      )
      .in('type', ['purchase', 'topup'])
      .not('description', 'ilike', '%manual%')
      .lt('created_at', end.toISOString())
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)
      .then(({ data, error }) => ({
        data: (data as DailyStatsCreditTransaction[] | null) ?? null,
        error,
      })),
  );
}

export function getCallSessionDurationsBefore(
  supabase: DailyStatsSupabaseClient,
  end: Date,
): Promise<DailyStatsCallSessionDuration[]> {
  return fetchAllPages<DailyStatsCallSessionDuration>((offset) =>
    supabase
      .from('call_sessions')
      .select('duration_seconds')
      .lt('started_at', end.toISOString())
      .order('started_at', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)
      .then(({ data, error }) => ({
        data: (data as DailyStatsCallSessionDuration[] | null) ?? null,
        error,
      })),
  );
}
