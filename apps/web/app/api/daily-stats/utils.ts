import type { DailyStatsProfileRelation } from './types';

interface UsageBreakdownEvent {
  credits_used: number;
  source_type: string;
}

type DateRangeItem<K extends string = string> = Record<K, string>;
interface MetadataWithDollarAmount {
  dollarAmount?: number;
}

// Helper to time individual queries
export const _timed = async <T>(
  label: string,
  promise: PromiseLike<T>,
): Promise<T> => {
  const start = Date.now();
  console.log(`⏱  [daily-stats] START  ${label}`);
  try {
    const result = await promise;
    console.log(`✅ [daily-stats] DONE   ${label} — ${Date.now() - start}ms`);
    return result;
  } catch (err) {
    console.log(
      `❌ [daily-stats] ERROR  ${label} — ${Date.now() - start}ms`,
      err,
    );
    throw err;
  }
};

export function formatCompactNumber(num: number): string {
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1)}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}k`;
  }
  return num.toLocaleString();
}

export function startOfDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

export function subtractDays(date: Date, days: number): Date {
  // 86_400_000 milliseconds in 24 hours
  return new Date(date.getTime() - days * 86_400_000);
}

export function isInDateRange(value: string, start: Date, end: Date): boolean {
  const itemTime = new Date(value).getTime();
  return itemTime >= start.getTime() && itemTime < end.getTime();
}

export function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

export function startOfPreviousMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1));
}
export function formatChange(today: number, yesterday: number): string {
  const diff = today - yesterday;
  const formatted = diff % 1 === 0 ? diff.toString() : diff.toFixed(1);
  return diff >= 0 ? `+${formatted}` : `${formatted}`;
}

export function formatCurrencyChange(
  current: number,
  previous: number,
): string {
  const diff = current - previous;
  if (previous === 0) {
    if (current === 0) {
      return '→$0.00 (no change)';
    }
    return `↑$${current.toFixed(2)} (new)`;
  }
  const pct = (diff / previous) * 100;
  const arrow = diff >= 0 ? '↑' : '↓';

  return `${arrow}$${Math.abs(diff).toFixed(2)} (${arrow}${Math.abs(pct).toFixed(0)}%)`;
}

// Format duration in minutes
export const formatDuration = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
};

export const formatDurationChange = (
  currentSeconds: number,
  baselineSeconds: number,
): string => {
  const diffSeconds = Math.round(currentSeconds - baselineSeconds);
  const sign = diffSeconds >= 0 ? '+' : '-';
  return `${sign}${formatDuration(Math.abs(diffSeconds))}`;
};

export function reduceAmountUsd(acc: number, row: { metadata: Json }): number {
  if (!row.metadata || typeof row.metadata !== 'object') {
    console.log('Invalid metadata in row:', row);
    return acc;
  }

  const { dollarAmount } = row.metadata as MetadataWithDollarAmount;
  return typeof dollarAmount === 'number' ? acc + dollarAmount : acc;
}

export function getProfileUsername(
  profileRelation: DailyStatsProfileRelation,
): string | undefined {
  if (!profileRelation) {
    return undefined;
  }

  if (Array.isArray(profileRelation)) {
    return profileRelation[0]?.username;
  }

  return profileRelation.username;
}

export function maskUsername(username?: string): string | undefined {
  let maskedUsername = username;
  if (username?.includes('@')) {
    const [localPart, domain] = username.split('@');
    if (localPart.length > 6) {
      const first3 = localPart.slice(0, 3);
      const last3 = localPart.slice(-3);
      maskedUsername = `${first3}...${last3}@${domain}`;
    } else if (localPart.length > 3) {
      const first3 = localPart.slice(0, 3);
      maskedUsername = `${first3}...@${domain}`;
    } else {
      maskedUsername = `${localPart.slice(0, 1)}...@${domain}`;
    }
  }
  return maskedUsername;
}

export function filterByDateRange<T extends { created_at: string }>(
  items: T[],
  start: Date,
  end: Date,
): T[];
export function filterByDateRange<K extends string, T extends DateRangeItem<K>>(
  items: T[],
  start: Date,
  end: Date,
  dateKey: K,
): T[];
export function filterByDateRange<T extends Record<string, unknown>>(
  items: T[],
  start: Date,
  end: Date,
  dateKey = 'created_at',
): T[] {
  return items.filter((item) =>
    isInDateRange(item[dateKey] as string, start, end),
  );
}

export function countByDateRange<T extends { created_at: string }>(
  items: T[],
  start: Date,
  end: Date,
): number;
export function countByDateRange<K extends string, T extends DateRangeItem<K>>(
  items: T[],
  start: Date,
  end: Date,
  dateKey: K,
): number;
export function countByDateRange<T extends Record<string, unknown>>(
  items: T[],
  start: Date,
  end: Date,
  dateKey = 'created_at',
): number {
  return items.reduce(
    (count, item) =>
      count + (isInDateRange(item[dateKey] as string, start, end) ? 1 : 0),
    0,
  );
}

export const getFeatureHealthStatus = (
  current: number,
  baseline: number,
): '🟢 active' | '🟡 below trend' | '🔴 no usage' => {
  if (current === 0) return '🔴 no usage';
  if (baseline > 0 && current < baseline) return '🟡 below trend';
  return '🟢 active';
};

// Top models calculation
export const normalizeModelName = (modelName: string | null | undefined) => {
  const trimmedModelName = modelName?.trim();
  if (!trimmedModelName) return 'Unknown';

  const modelWithoutVersion =
    trimmedModelName.split(':')[0] ?? trimmedModelName;
  const modelWithoutOwner =
    modelWithoutVersion.split('/').pop() ?? modelWithoutVersion;
  const normalizedModelName = modelWithoutOwner
    .replace('-preview-tts', '')
    .replace('-multilingual', '');

  const friendlyModelLabels: Record<string, string> = {
    chatterbox: 'Chatterbox',
    'gemini-2.5-flash': 'Gemini Flash',
    'gemini-2.5-pro': 'Gemini Pro',
    grok: 'Grok',
    'orpheus-3b-0.1-ft': 'Orpheus',
    'voxtral-mini-tts-2603': 'Voxtral Clone',
  };

  return friendlyModelLabels[normalizedModelName] ?? normalizedModelName;
};

export const calculateUsageBreakdown = (
  events: UsageBreakdownEvent[],
): Map<string, number> => {
  const breakdown = new Map<string, number>();
  for (const event of events) {
    const current = breakdown.get(event.source_type) ?? 0;
    breakdown.set(event.source_type, current + event.credits_used);
  }
  return breakdown;
};

/**
 * Pagination utilities for Supabase queries
 *
 * Supabase has a default limit of 1000 rows per query.
 * Use these utilities to fetch all records from large tables.
 */

export const PAGE_SIZE = 1000;

/**
 * Paginates through all results from a Supabase query.
 *
 * @example
 * ```ts
 * const results = await fetchAllPages<{ user_id: string }>((offset) =>
 *   supabase
 *     .from("table")
 *     .select("user_id")
 *     .range(offset, offset + PAGE_SIZE - 1)
 * );
 * ```
 *
 * @param queryBuilder - A function that takes an offset and returns a Supabase query promise
 * @returns All records from the query, concatenated together
 */
export async function fetchAllPages<T>(
  queryBuilder: (
    offset: number,
  ) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const allData: T[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await queryBuilder(offset);

    if (error) {
      if (error instanceof Error) {
        throw error;
      }

      const msg =
        typeof error === 'object' && error !== null && 'message' in error
          ? (error as { message: string }).message
          : String(error);
      throw new Error(msg, { cause: error });
    }

    if (!data || data.length === 0) {
      break;
    }

    allData.push(...data);

    if (data.length < PAGE_SIZE) {
      break;
    }

    offset += PAGE_SIZE;
  }

  return allData;
}
