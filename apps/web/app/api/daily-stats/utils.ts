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
 * Three shapes, because a run of rows sharing one `column` value cannot always
 * be stepped over in a single filter:
 *
 * - `exclude` — the common case. Re-read `value` inclusively and drop the ids
 *   already emitted at it. A strict `>` would lose the rest of the run.
 * - `within` — the run is longer than one cursor can carry ids for, so walk it
 *   by `id` instead.
 * - `after`  — the run is exhausted; step past `value`.
 *
 * Every shape is a plain AND of filters. The textbook `(c > v) OR (c = v AND
 * id > lastId)` predicate would be one request shorter in the `within` case,
 * but it needs a second top-level `or=` param on the three queries that already
 * use `.or()` for their own filters, and whether PostgREST ANDs repeated `or=`
 * params is not something this code can verify at runtime. Getting that wrong
 * silently changes which rows a revenue report counts, so it is not assumed.
 */
export type PageCursor =
  | {
      kind: 'exclude';
      column: string;
      value: string;
      excludeIds: readonly string[];
    }
  | { kind: 'within'; column: string; value: string; afterId: string }
  | { kind: 'after'; column: string; value: string };

/**
 * When a page ends on a run longer than this, the cursor walks the run by `id`
 * rather than listing its ids. An estimate, not a measured threshold: at ~37
 * bytes per uuid, 100 ids is ~3.7KB of the 8-16KB request line proxies commonly
 * accept. The rest is not free either — the same URL carries `excludeUserIds`
 * as a second uuid list, plus the select, range filters, order and limit.
 *
 * The two directions are not symmetric, which is what sets the value. Erring
 * low costs one extra request. Erring high risks a 414, which is not a
 * transient error and so fails the whole run on its first response — the same
 * class of failure this pagination exists to avoid. So it sits well under what
 * should fit rather than close to it.
 *
 * Row correctness does not depend on this number either way; it only chooses
 * between two correct strategies. Postgres fixes `now()` at transaction start,
 * so any bulk insert produces a run long enough to reach it: a promo grant, a
 * backfill, a support batch.
 */
const MAX_CURSOR_EXCLUDE_IDS = 100;

interface CursorFilterable {
  eq: (column: string, value: string) => CursorFilterable;
  gt: (column: string, value: string) => CursorFilterable;
  gte: (column: string, value: string) => CursorFilterable;
  not: (column: string, operator: string, value: string) => CursorFilterable;
}

/**
 * Narrows a query to the rows after `cursor`, returning it unchanged in type.
 *
 * `Q` is deliberately unconstrained: constraining it to `CursorFilterable`
 * makes TypeScript instantiate PostgREST's builder generics too deeply to
 * resolve (TS2589). The cast is checked instead by the `applyPageCursor` tests,
 * which assert the exact filters each cursor shape emits.
 */
export function applyPageCursor<Q>(query: Q, cursor: PageCursor | null): Q {
  if (!cursor) {
    return query;
  }

  const filterable = query as CursorFilterable;

  if (cursor.kind === 'after') {
    return filterable.gt(cursor.column, cursor.value) as Q;
  }

  if (cursor.kind === 'within') {
    return filterable
      .eq(cursor.column, cursor.value)
      .gt('id', cursor.afterId) as Q;
  }

  const seeked = filterable.gte(cursor.column, cursor.value);
  if (cursor.excludeIds.length === 0) {
    return seeked as Q;
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

    if (data?.length) {
      allData.push(...data);
    }

    if (data === null || data.length < PAGE_SIZE) {
      // A short page ends the read — unless it was walking a run of equal
      // values, which only means that run is exhausted and rows past it remain.
      if (cursor?.kind !== 'within') {
        break;
      }
      cursor = {
        column: cursor.column,
        kind: 'after',
        value: cursor.value,
      };
      continue;
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
  // at an earlier value are dropped by the seek itself.
  const excludeIds = page
    .filter((row) => readCursorField(row, cursorColumn) === value)
    .map((row) => readCursorField(row, 'id'));

  // Too many to carry as ids. Rows are ordered by id within a value, so every
  // one read so far is at or below the last — walk the rest by id. This also
  // rules out a stale exclusion list: a full page that ends where it began is
  // entirely one value, which always lands here rather than in `exclude`.
  if (excludeIds.length > MAX_CURSOR_EXCLUDE_IDS) {
    return {
      afterId: readCursorField(page.at(-1), 'id'),
      column: cursorColumn,
      kind: 'within',
      value,
    };
  }

  return { column: cursorColumn, excludeIds, kind: 'exclude', value };
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
 * be matched on text. The timeout alternation covers the observed
 * `Gateway Timeout`, nginx's hyphenated `504 Gateway Time-out`, Kong's
 * `upstream server is timing out`, and `ETIMEDOUT`.
 */
const TRANSIENT_ERROR_MESSAGE =
  /bad gateway|service unavailable|temporarily unavailable|canceling statement|connection (?:reset|closed|terminated)|socket hang up|fetch failed|econnreset|tim(?:ed?[ -]?out|ing out)/i;

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
