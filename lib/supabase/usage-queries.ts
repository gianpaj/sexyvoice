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
  nextCursor?: string | null;
  prevCursor?: string | null;
}

export interface MonthlyUsageSummary {
  totalCredits: number;
  totalOperations: number;
  bySourceType: Record<UsageSourceType, { credits: number; count: number }>;
}

export interface GetUsageEventsOptions {
  pageSize: number;
  sourceType?: UsageSourceType;
  cursor?: string | null;
  direction?: 'next' | 'prev';
}

interface UsageEventsCursor {
  occurred_at: string;
  id: string;
}

function encodeCursor(cursor: UsageEventsCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64');
}

function decodeCursor(cursor: string): UsageEventsCursor | null {
  try {
    return JSON.parse(Buffer.from(cursor, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

export function buildUsageEventsCursors(
  data: UsageEvent[],
): { nextCursor: string | null; prevCursor: string | null } {
  if (data.length === 0) {
    return { nextCursor: null, prevCursor: null };
  }

  const first = data[0];
  const last = data[data.length - 1];

  return {
    nextCursor: encodeCursor({
      occurred_at: last.occurred_at,
      id: last.id,
    }),
    prevCursor: encodeCursor({
      occurred_at: first.occurred_at,
      id: first.id,
    }),
  };
}

/**
 * Get paginated usage events for a user
 */
export async function getUsageEventsPaginated(
  client: TypedSupabaseClient,
  userId: string,
  options: GetUsageEventsOptions,
): Promise<{ data: UsageEvent[]; totalCount: number }> {
  const { pageSize, sourceType, cursor, direction = 'next' } = options;

  // Build the query
  let query = client
    .from('usage_events')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .order('occurred_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(pageSize);

  const decodedCursor = cursor ? decodeCursor(cursor) : null;
  if (decodedCursor) {
    const { occurred_at, id } = decodedCursor;
    const operator = direction === 'prev' ? 'gt' : 'lt';
    query = query.or(
      `occurred_at.${operator}.${occurred_at},and(occurred_at.eq.${occurred_at},id.${operator}.${id})`,
    );
  }

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
 * Build a MonthlyUsageSummary from RPC results
 */
function buildSummaryFromRpcData(
  data: Array<{
    source_type: UsageSourceType;
    total_credits: number;
    operation_count: number;
  }> | null,
): MonthlyUsageSummary {
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

  for (const row of data ?? []) {
    const sourceType = row.source_type as UsageSourceType;
    const credits = Number(row.total_credits);
    const count = Number(row.operation_count);

    summary.totalCredits += credits;
    summary.totalOperations += count;

    if (summary.bySourceType[sourceType]) {
      summary.bySourceType[sourceType].credits = credits;
      summary.bySourceType[sourceType].count = count;
    }
  }

  return summary;
}

/**
 * Get monthly usage summary for the current calendar month
 * Uses SQL aggregation via RPC for performance
 */
export async function getMonthlyUsageSummary(
  client: TypedSupabaseClient,
  userId: string,
): Promise<MonthlyUsageSummary> {
  // Get start of current month
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const { data, error } = await client.rpc('get_usage_summary', {
    p_user_id: userId,
    p_start_date: startOfMonth.toISOString(),
  });

  if (error) {
    throw error;
  }

  return buildSummaryFromRpcData(data);
}

/**
 * Get all-time usage summary for total summary card
 * Uses SQL aggregation via RPC for performance
 */
export async function getAllTimeUsageSummary(
  client: TypedSupabaseClient,
  userId: string,
): Promise<MonthlyUsageSummary> {
  const { data, error } = await client.rpc('get_usage_summary', {
    p_user_id: userId,
  });

  if (error) {
    throw error;
  }

  return buildSummaryFromRpcData(data);
}
