import type { DailyStatsProfileRelation } from './types';

interface UsageBreakdownEvent {
  credits_used: number;
  source_type: string;
}

type DateRangeItem<K extends string = string> = Record<K, string>;
interface MetadataWithDollarAmount {
  dollarAmount?: number;
}

// Matches the admin dashboard's completed-call metric.
export function isCompletedUserCall(
  call: Pick<Tables<'call_sessions'>, 'status' | 'duration_seconds'>,
): boolean {
  return call.status === 'completed' && call.duration_seconds > 10;
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

export function reduceAmountUsd(acc: number, row: { metadata: Json }): number {
  if (!row.metadata || typeof row.metadata !== 'object') {
    console.log('Invalid metadata in row:', row);
    return acc;
  }

  const { dollarAmount } = row.metadata as MetadataWithDollarAmount;
  return typeof dollarAmount === 'number' ? acc + dollarAmount : acc;
}

// `metadata.reason` values set on the chargeback freeze / restore credit_transactions
// rows (see the dispute-evidence SQL playbook). Kept here so daily-stats and any
// future tooling classify these rows the same way.
export const CHARGEBACK_HOLD_REASON = 'chargeback_dispute';
export const CHARGEBACK_RELEASE_REASON = 'chargeback_dispute_released';

export type RefundKind = 'refund' | 'chargeback_hold' | 'chargeback_release';

/**
 * Classify a `type='refund'` credit_transactions row.
 *
 * Chargeback hold (freeze) and release (dispute won) rows are internal
 * credit-ledger moves, not customer refunds — they carry no `dollarAmount` and
 * must be kept out of the refund metrics. Everything else (cash refunds and
 * platform-bug credit refunds) is a genuine refund. Keyed on the exact reason
 * string, not on the absence of `dollarAmount`, because platform-bug refunds
 * also lack a `dollarAmount`.
 */
export function classifyRefund(row: { metadata: Json }): RefundKind {
  const reason =
    row.metadata && typeof row.metadata === 'object'
      ? (row.metadata as { reason?: unknown }).reason
      : undefined;
  if (reason === CHARGEBACK_HOLD_REASON) {
    return 'chargeback_hold';
  }
  if (reason === CHARGEBACK_RELEASE_REASON) {
    return 'chargeback_release';
  }
  return 'refund';
}

export function getProfileUsername(
  profileRelation: DailyStatsProfileRelation,
): string | undefined {
  if (!profileRelation) {
    return;
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
    .replace('-tts-preview', '')
    .replace('-multilingual', '');

  const friendlyModelLabels: Record<string, string> = {
    chatterbox: 'Chatterbox',
    'gemini-2.5-flash': 'Gemini Flash',
    'gemini-2.5-pro': 'Gemini Pro',
    'gemini-3.1-flash': 'Gemini 3.1',
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
 * PostgREST caps a response at 1000 rows, so reading a whole range means
 * walking it a page at a time. These helpers do that with a keyset cursor
 * rather than LIMIT/OFFSET: an offset page makes Postgres sort and then
 * discard every row it skips, so cost grows with depth and the deepest pages
 * are the ones that time out at Supabase's gateway.
 */

export const PAGE_SIZE = 1000;

export const formatIdList = (ids: readonly string[]) => `(${ids.join(',')})`;

/**
 * Position in a query ordered by `(column asc, id asc)`.
 *
 * `value` is re-read inclusively and `excludeIds` drops the rows already
 * emitted at exactly that value, so rows sharing a timestamp are neither
 * skipped nor returned twice. A strict `>` cursor would lose the ones after
 * the page boundary.
 */
export interface PageCursor {
  column: string;
  excludeIds: readonly string[];
  value: string;
}

/**
 * Cap on the ids carried in a cursor: ~37 bytes per uuid, so 200 already puts
 * the request near the gateway's URL limit. Every column paged on defaults to a
 * per-row `now()` at microsecond precision, so real boundaries hold one or two
 * rows. Hitting this means the data is not what these queries assume — fail
 * loudly rather than build a URL that gets rejected, or silently drop rows.
 */
const MAX_CURSOR_EXCLUDE_IDS = 200;

interface CursorFilterable {
  gte: (column: string, value: string) => CursorFilterable;
  not: (column: string, operator: string, value: string) => CursorFilterable;
}

/** Narrows a query to the rows after `cursor`. */
export function applyPageCursor<Q extends CursorFilterable>(
  query: Q,
  cursor: PageCursor | null,
): Q {
  if (!cursor) {
    return query;
  }

  const seeked = query.gte(cursor.column, cursor.value) as Q;
  if (cursor.excludeIds.length === 0) {
    return seeked;
  }
  return seeked.not('id', 'in', formatIdList(cursor.excludeIds)) as Q;
}

/**
 * Reads every row of a query ordered by `(cursorColumn asc, id asc)`.
 *
 * The builder must select both `cursorColumn` and `id` — they carry the cursor
 * — and apply it with {@link applyPageCursor}.
 *
 * @example
 * ```ts
 * const rows = await fetchAllPages<Row>('created_at', (cursor) =>
 *   applyPageCursor(supabase.from('t').select('id, created_at'), cursor)
 *     .order('created_at')
 *     .order('id')
 *     .limit(PAGE_SIZE),
 * );
 * ```
 */
export async function fetchAllPages<T>(
  cursorColumn: string,
  queryBuilder: (
    cursor: PageCursor | null,
  ) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const allData: T[] = [];
  let cursor: PageCursor | null = null;

  while (true) {
    const data: T[] | null = await fetchPage(queryBuilder, cursor);

    if (!data || data.length === 0) {
      break;
    }

    allData.push(...data);

    if (data.length < PAGE_SIZE) {
      break;
    }

    cursor = nextCursor(data, cursorColumn, cursor);
  }

  return allData;
}

function readCursorField(row: unknown, column: string): string {
  const value = (row as Record<string, unknown>)[column];
  if (typeof value !== 'string') {
    throw new Error(
      `fetchAllPages: row has no string \`${column}\` to page on — add it to the select`,
    );
  }
  return value;
}

function nextCursor<T>(
  page: T[],
  cursorColumn: string,
  previous: PageCursor | null,
): PageCursor {
  const value = readCursorField(page.at(-1), cursorColumn);

  // A cursor that goes backwards never terminates: the same page would be read
  // forever. Means the query is not actually ordered by `cursorColumn` asc.
  if (previous && value < previous.value) {
    throw new Error(
      `fetchAllPages: \`${cursorColumn}\` went backwards (${previous.value} to ${value}); the query must order by it ascending`,
    );
  }

  // Only rows at exactly `value` can come back again under `gte(value)`; rows
  // at an earlier value are dropped by the seek itself. This page holds every
  // such row, because a full page is sorted and ends at `value` — so there is
  // no earlier page's boundary left to carry forward.
  const excludeIds = page
    .filter((row) => readCursorField(row, cursorColumn) === value)
    .map((row) => readCursorField(row, 'id'));

  if (excludeIds.length > MAX_CURSOR_EXCLUDE_IDS) {
    throw new Error(
      `fetchAllPages: ${excludeIds.length} rows share \`${cursorColumn}\` ${value}; cannot page past them`,
    );
  }

  return { column: cursorColumn, excludeIds, value };
}

/**
 * Postgres SQLSTATEs worth retrying. Daily stats only reads, so replaying a
 * page is always safe.
 */
const TRANSIENT_POSTGRES_CODES = new Set([
  '08000', // connection_exception
  '08003', // connection_does_not_exist
  '08006', // connection_failure
  '53300', // too_many_connections
  '57014', // query_canceled (statement timeout)
]);

/**
 * Supabase's API gateway sheds load with plain 502/503/504 responses that
 * PostgREST surfaces as a bare `{ message }` with no SQLSTATE, so these have to
 * be matched on text. `timed? ?out` covers the observed `Gateway Timeout` as
 * well as `ETIMEDOUT` and `query timed out`.
 */
const TRANSIENT_ERROR_MESSAGE =
  /bad gateway|service unavailable|temporarily unavailable|canceling statement|connection (?:reset|closed|terminated)|socket hang up|fetch failed|econnreset|timed? ?out/i;

export function isTransientQueryError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const { code, message } = error as { code?: unknown; message?: unknown };

  if (typeof code === 'string' && TRANSIENT_POSTGRES_CODES.has(code)) {
    return true;
  }

  return typeof message === 'string' && TRANSIENT_ERROR_MESSAGE.test(message);
}

function toQueryError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  const msg =
    typeof error === 'object' && error !== null && 'message' in error
      ? (error as { message: string }).message
      : String(error);
  return new Error(msg, { cause: error });
}

export const PAGE_MAX_ATTEMPTS = 4;
const PAGE_RETRY_BASE_DELAY_MS = 500;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fetches one page, replaying it with exponential backoff when Supabase
 * answers with a transient gateway or connection failure. A whole daily-stats
 * run is wasted when a single page fails, so the cheap retry is worth it.
 */
async function fetchPage<T>(
  queryBuilder: (
    cursor: PageCursor | null,
  ) => PromiseLike<{ data: T[] | null; error: unknown }>,
  cursor: PageCursor | null,
): Promise<T[] | null> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= PAGE_MAX_ATTEMPTS; attempt++) {
    try {
      const { data, error } = await queryBuilder(cursor);
      if (!error) {
        return data;
      }
      lastError = error;
    } catch (error) {
      lastError = error;
    }

    if (!isTransientQueryError(lastError) || attempt === PAGE_MAX_ATTEMPTS) {
      throw toQueryError(lastError);
    }

    const delayMs = PAGE_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
    console.warn(
      `♻️  [daily-stats] transient page error at ${cursor ? `${cursor.column} ${cursor.value}` : 'start'}, retrying in ${delayMs}ms (attempt ${attempt}/${PAGE_MAX_ATTEMPTS})`,
      lastError,
    );
    await wait(delayMs);
  }

  throw toQueryError(lastError);
}
