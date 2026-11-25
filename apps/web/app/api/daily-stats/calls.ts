import { callVoiceProvider } from '@/lib/call-voices';
import type { DailyStatsCallSession } from './queries';
import {
  filterByDateRange,
  formatDuration,
  formatMinutes,
  formatTrend,
  isCompletedUserCall,
  subtractDays,
} from './utils';

const TREND_DAYS = 7;

type Call = Pick<
  DailyStatsCallSession,
  | 'character_id'
  | 'duration_seconds'
  | 'free_call'
  | 'model'
  | 'started_at'
  | 'status'
>;

interface CallTotals {
  count: number;
  seconds: number;
}

interface CallsSectionInput {
  /** Estimated AI cost yesterday, and in total over the baseline days. */
  aiCost: { baseline: number; yesterday: number };
  allTime: { count: number; avgSeconds: number };
  /** UTC days before yesterday that form the baseline; at least 13. */
  baselineDays: number;
  /** Calls started yesterday and in the baseline days before it. */
  calls: Call[];
  inworldVoices: string;
  newCharactersYesterday: number;
  publicCharacterIds: ReadonlySet<string>;
  today: Date;
}

const totals = (calls: Call[]): CallTotals => ({
  count: calls.length,
  seconds: calls.reduce((sum, call) => sum + call.duration_seconds, 0),
});

const perDay = ({ count, seconds }: CallTotals, days: number): CallTotals => ({
  count: count / days,
  seconds: seconds / days,
});

const averageSeconds = ({ count, seconds }: CallTotals) =>
  count > 0 ? Math.round(seconds / count) : 0;

// Average call length under this change reads as flat (`→`).
const FLAT_AVERAGE_PCT = 10;

// Minutes carry an arrow only for a large change: they drive both AI cost and
// engagement, and counts mostly move with them. Lines that track engagement
// also compare average call length.
function formatTotals(
  current: CallTotals,
  baseline: CallTotals,
  { averageTrend = false } = {},
): string {
  const minutes = formatMinutes(current.seconds);
  const trend = formatTrend(current.seconds, baseline.seconds);
  const parts = [`${current.count}`, trend ? `${minutes} ${trend}` : minutes];
  if (current.count > 0) {
    const average = averageSeconds(current);
    let text = `avg ${formatDuration(average)}`;
    if (averageTrend) {
      const averageChange = formatTrend(
        average,
        averageSeconds(baseline),
        FLAT_AVERAGE_PCT,
      );
      text += ` ${averageChange || '→'}`;
    }
    parts.push(text);
  }
  return parts.join(' · ');
}

/**
 * The report's Calls section. Daily figures compare yesterday with the daily
 * average of the days before it, so yesterday never dilutes its own baseline.
 * The weekly line shows the direction a single noisy day can't.
 */
export function formatCallsSection({
  aiCost,
  allTime,
  baselineDays,
  calls,
  inworldVoices,
  newCharactersYesterday,
  publicCharacterIds,
  today,
}: CallsSectionInput): string[] {
  const yesterdayStart = subtractDays(today, 1);
  const yesterdayCalls = filterByDateRange(
    calls,
    yesterdayStart,
    today,
    'started_at',
  );
  const priorCalls = filterByDateRange(
    calls,
    subtractDays(yesterdayStart, baselineDays),
    yesterdayStart,
    'started_at',
  );
  const yesterday = totals(yesterdayCalls);
  const priorDaily = perDay(totals(priorCalls), baselineDays);

  const weekStart = subtractDays(today, TREND_DAYS);
  const lastWeek = totals(
    filterByDateRange(calls, weekStart, today, 'started_at'),
  );
  const previousWeek = totals(
    filterByDateRange(
      calls,
      subtractDays(weekStart, TREND_DAYS),
      weekStart,
      'started_at',
    ),
  );

  const isPublic = (call: Call) =>
    call.character_id !== null && publicCharacterIds.has(call.character_id);
  const isCloned = (call: Call) => callVoiceProvider(call.model) !== null;
  // Two independent splits: who called, and what they called. The user split
  // also compares average call length.
  const segments: [
    label: string,
    matches: (call: Call) => boolean,
    averageTrend: boolean,
  ][] = [
    ['Free users', (call) => call.free_call === true, true],
    ['Paying users', (call) => call.free_call !== true, true],
    ['Predefined characters', isPublic, false],
    [
      'Custom, Grok voice',
      (call) => !(isPublic(call) || isCloned(call)),
      false,
    ],
    [
      'Custom, cloned voice',
      (call) => !isPublic(call) && isCloned(call),
      false,
    ],
  ];

  const aiCostParts = [`$${aiCost.yesterday.toFixed(2)}`];
  if (yesterday.seconds > 0) {
    const perMinute = aiCost.yesterday / (yesterday.seconds / 60);
    aiCostParts.push(`$${perMinute.toFixed(3)}/min`);
  }
  const aiCostPriorDaily = aiCost.baseline / baselineDays;
  aiCostParts.push(`${baselineDays}d avg $${aiCostPriorDaily.toFixed(2)}/day`);

  return [
    `📞 Calls: ${formatTotals(yesterday, priorDaily)}`,
    `  - ${baselineDays}d daily avg: ${priorDaily.count.toFixed(1)} · ${formatMinutes(priorDaily.seconds)} · avg ${formatDuration(averageSeconds(priorDaily))}`,
    `  - ${TREND_DAYS}d vs prior ${TREND_DAYS}d: ${formatTotals(lastWeek, previousWeek, { averageTrend: true })}`,
    `  - Completed (>10s): ${yesterdayCalls.filter(isCompletedUserCall).length}`,
    ...segments.map(([label, matches, averageTrend]) => {
      const current = totals(yesterdayCalls.filter(matches));
      const baseline = perDay(totals(priorCalls.filter(matches)), baselineDays);
      return `  - ${label}: ${formatTotals(current, baseline, { averageTrend })}`;
    }),
    `  - New custom characters: ${newCharactersYesterday}`,
    `  - AI usage (est.): ${aiCostParts.join(' · ')}`,
    `  - All-time: ${allTime.count.toLocaleString()} calls (avg ${formatDuration(allTime.avgSeconds)}) · Inworld voices: ${inworldVoices}`,
  ];
}

export interface DailyCallCount {
  calls: number;
  /** UTC day, `YYYY-MM-DD`. */
  date: string;
}

/** Calls started on each UTC day from `start`, with zero for days without calls. */
export function countCallsPerDay(
  calls: Pick<Call, 'started_at'>[],
  start: Date,
  days: number,
): DailyCallCount[] {
  const counts = new Map<string, number>();
  for (const call of calls) {
    const date = new Date(call.started_at).toISOString().slice(0, 10);
    counts.set(date, (counts.get(date) ?? 0) + 1);
  }
  return Array.from({ length: days }, (_, i) => {
    const date = subtractDays(start, -i).toISOString().slice(0, 10);
    return { calls: counts.get(date) ?? 0, date };
  });
}
