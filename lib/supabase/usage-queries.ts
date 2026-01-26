import type { TypedSupabaseClient } from './client';

export type UsageSourceType =
  | 'tts'
  | 'voice_cloning'
  | 'live_call'
  | 'audio_processing';

export type UsageUnitType = 'chars' | 'mins' | 'secs' | 'operation';

export type UsageEvent = Tables<'usage_events'>;

export interface PaginatedUsageEventsResponse {
  data: UsageEvent[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface MonthlyUsageSummary {
  totalCredits: number;
  totalOperations: number;
  bySourceType: Record<UsageSourceType, { credits: number; count: number }>;
}

export interface GetUsageEventsOptions {
  page: number;
  pageSize: number;
  sourceType?: UsageSourceType;
}

/**
 * Get paginated usage events for a user
 */
export async function getUsageEventsPaginated(
  client: TypedSupabaseClient,
  userId: string,
  options: GetUsageEventsOptions,
): Promise<{ data: UsageEvent[]; totalCount: number }> {
  const { page, pageSize, sourceType } = options;
  const offset = (page - 1) * pageSize;

  // Build the query
  let query = client
    .from('usage_events')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .order('occurred_at', { ascending: false })
    .range(offset, offset + pageSize - 1);

  // Apply source type filter if provided
  if (sourceType) {
    query = query.eq('source_type', sourceType);
  }

  const { data, count, error } = await query;

  if (error) {
    throw error;
  }

  return {
    data: data ?? [],
    totalCount: count ?? 0,
  };
}

/**
 * Get monthly usage summary for the current calendar month
 */
export async function getMonthlyUsageSummary(
  client: TypedSupabaseClient,
  userId: string,
): Promise<MonthlyUsageSummary> {
  // Get start of current month
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfMonthISO = startOfMonth.toISOString();

  const { data, error } = await client
    .from('usage_events')
    .select('source_type, credits_used')
    .eq('user_id', userId)
    .gte('occurred_at', startOfMonthISO);

  if (error) {
    throw error;
  }

  // Initialize the summary
  const summary: MonthlyUsageSummary = {
    totalCredits: 0,
    totalOperations: 0,
    bySourceType: {
      tts: { credits: 0, count: 0 },
      voice_cloning: { credits: 0, count: 0 },
      live_call: { credits: 0, count: 0 },
      audio_processing: { credits: 0, count: 0 },
    },
  };

  // Aggregate the data
  for (const event of data ?? []) {
    summary.totalCredits += event.credits_used;
    summary.totalOperations += 1;

    const sourceType = event.source_type as UsageSourceType;
    if (summary.bySourceType[sourceType]) {
      summary.bySourceType[sourceType].credits += event.credits_used;
      summary.bySourceType[sourceType].count += 1;
    }
  }

  return summary;
}

/**
 * Get all-time usage summary for total summary card
 */
export async function getAllTimeUsageSummary(
  client: TypedSupabaseClient,
  userId: string,
): Promise<MonthlyUsageSummary> {
  const { data, error } = await client
    .from('usage_events')
    .select('source_type, credits_used')
    .eq('user_id', userId);

  if (error) {
    throw error;
  }

  // Initialize the summary
  const summary: MonthlyUsageSummary = {
    totalCredits: 0,
    totalOperations: 0,
    bySourceType: {
      tts: { credits: 0, count: 0 },
      voice_cloning: { credits: 0, count: 0 },
      live_call: { credits: 0, count: 0 },
      audio_processing: { credits: 0, count: 0 },
    },
  };

  // Aggregate the data
  for (const event of data ?? []) {
    summary.totalCredits += event.credits_used;
    summary.totalOperations += 1;

    const sourceType = event.source_type as UsageSourceType;
    if (summary.bySourceType[sourceType]) {
      summary.bySourceType[sourceType].credits += event.credits_used;
      summary.bySourceType[sourceType].count += 1;
    }
  }

  return summary;
}
