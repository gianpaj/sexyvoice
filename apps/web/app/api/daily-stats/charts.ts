import { VOICE_CLONING_MODELS } from '@/lib/clone/constants';
import type {
  DailyStatsAudioFile,
  DailyStatsCallSession,
  DailyStatsCreditTransaction,
  DailyStatsProfile,
} from './queries';
import { isFreeUserCall, reduceAmountUsd, subtractDays } from './utils';

/** One UTC day of the charts Mini App. */
export interface DailyChartRow {
  /** Audio files from models other than voice cloning. */
  audio: number;
  callMinutes: number;
  calls: number;
  /** Audio files from voice cloning models. */
  clonedAudio: number;
  /** `YYYY-MM-DD`. */
  date: string;
  freeCallMinutes: number;
  freeCalls: number;
  paidCallMinutes: number;
  paidCalls: number;
  profiles: number;
  /** The report's revenue: `dollarAmount` of purchases, top-ups and refunds. */
  revenueUsd: number;
}

export interface ChartSources {
  audioFiles: Pick<DailyStatsAudioFile, 'created_at' | 'model'>[];
  calls: Pick<
    DailyStatsCallSession,
    'duration_seconds' | 'free_call' | 'started_at'
  >[];
  creditTransactions: Pick<
    DailyStatsCreditTransaction,
    'created_at' | 'metadata'
  >[];
  profiles: Pick<DailyStatsProfile, 'created_at'>[];
}

const utcDate = (timestamp: string | Date) =>
  new Date(timestamp).toISOString().slice(0, 10);

const round = (value: number, decimals: number) =>
  Math.round(value * 10 ** decimals) / 10 ** decimals;

/** Totals per UTC day from `start`, with zeros for days without activity. */
export function buildDailyChartRows(
  sources: ChartSources,
  start: Date,
  days: number,
): DailyChartRow[] {
  const rows = Array.from({ length: days }, (_, i) => ({
    audio: 0,
    clonedAudio: 0,
    date: utcDate(subtractDays(start, -i)),
    freeCallSeconds: 0,
    freeCalls: 0,
    paidCallSeconds: 0,
    paidCalls: 0,
    profiles: 0,
    revenueUsd: 0,
  }));
  const rowsByDate = new Map(rows.map((row) => [row.date, row]));
  const rowFor = (timestamp: string | null) =>
    timestamp ? rowsByDate.get(utcDate(timestamp)) : undefined;

  for (const call of sources.calls) {
    const row = rowFor(call.started_at);
    if (!row) continue;
    if (isFreeUserCall(call)) {
      row.freeCalls += 1;
      row.freeCallSeconds += call.duration_seconds;
    } else {
      row.paidCalls += 1;
      row.paidCallSeconds += call.duration_seconds;
    }
  }
  for (const file of sources.audioFiles) {
    const row = rowFor(file.created_at);
    if (row) {
      if (VOICE_CLONING_MODELS.includes(file.model)) row.clonedAudio += 1;
      else row.audio += 1;
    }
  }
  for (const profile of sources.profiles) {
    const row = rowFor(profile.created_at);
    if (row) row.profiles += 1;
  }
  for (const transaction of sources.creditTransactions) {
    const row = rowFor(transaction.created_at);
    if (row) row.revenueUsd = reduceAmountUsd(row.revenueUsd, transaction);
  }

  return rows.map(({ freeCallSeconds, paidCallSeconds, ...row }) => ({
    ...row,
    callMinutes: round((freeCallSeconds + paidCallSeconds) / 60, 1),
    calls: row.freeCalls + row.paidCalls,
    freeCallMinutes: freeCallSeconds / 60,
    paidCallMinutes: paidCallSeconds / 60,
    revenueUsd: round(row.revenueUsd, 2),
  }));
}

/**
 * Average of the last `baselineDays` daily totals, matching the report line
 * the chart mirrors. The Calls section averages the days before yesterday;
 * revenue, audio files and new profiles average a window that includes it.
 */
export function baselineAverage(
  totals: number[],
  baselineDays: number,
  includesYesterday: boolean,
): number {
  const window = includesYesterday
    ? totals.slice(-baselineDays)
    : totals.slice(-1 - baselineDays, -1);
  if (window.length === 0) return 0;
  return window.reduce((sum, total) => sum + total, 0) / window.length;
}

/** Response of `GET /api/daily-stats/charts`. */
export interface ChartsResponse {
  /** UTC days before yesterday that form each chart's average line. */
  baselineDays: number;
  days: DailyChartRow[];
}
