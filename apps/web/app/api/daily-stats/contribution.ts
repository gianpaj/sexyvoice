import {
  type CostUsage,
  costMetadata,
  resolveUsageCost,
  type UsageCost,
} from '@/lib/usage-costs';
import { classifyRefund } from './utils';

export interface ContributionEvent extends CostUsage {
  credits_used: number;
  id: string;
  occurred_at: string;
  source_id: string | null;
  user_id: string | null;
}
export interface ContributionCall {
  duration_seconds: number | null;
  ended_at: string | null;
  id: string;
  model: string | null;
  started_at: string;
  status: string;
  user_id: string | null;
}
export interface ContributionTransaction {
  created_at: string;
  description: string | null;
  metadata: Json;
  type: string;
  user_id: string;
}
interface CostRecord {
  at: string;
  cost: UsageCost;
  credits: number;
  feature: string;
  legacy: boolean;
  supplemental: 'short' | 'missing' | null;
  userId: string | null;
}
export interface ContributionData {
  audioUsage: Record<string, unknown>;
  calls: ContributionCall[];
  events: ContributionEvent[];
  linkedCallIds: string[];
}
export function buildCostRecords(data: ContributionData): CostRecord[] {
  const calls = new Map(data.calls.map((call) => [call.id, call]));
  const linked = new Set([
    ...data.linkedCallIds,
    ...data.events
      .filter((event) => event.source_type === 'live_call')
      .map((event) => event.source_id),
  ]);
  const records: CostRecord[] = data.events.map((event) => ({
    at: event.occurred_at,
    cost: resolveUsageCost(
      event,
      calls.get(event.source_id ?? ''),
      data.audioUsage[event.source_id ?? ''],
    ),
    credits: event.credits_used,
    feature: event.source_type,
    legacy: false,
    supplemental: null,
    userId: event.user_id,
  }));
  for (const call of data.calls) {
    if (linked.has(call.id) || !isFinalCall(call)) continue;
    records.push({
      at: call.ended_at ?? call.started_at,
      cost: resolveUsageCost(
        {
          dollar_amount: null,
          duration_seconds: call.duration_seconds,
          input_chars: null,
          metadata: {},
          model: call.model,
          source_type: 'live_call',
        },
        call,
      ),
      credits: 0,
      feature: 'live_call',
      legacy: call.ended_at === null,
      supplemental:
        call.duration_seconds !== null && call.duration_seconds < 10
          ? 'short'
          : 'missing',
      userId: call.user_id,
    });
  }
  return records;
}
function isFinalCall(call: ContributionCall) {
  return (
    call.ended_at !== null ||
    ['completed', 'failed', 'error', 'disconnected'].includes(call.status)
  );
}
function cash(transaction: ContributionTransaction): number {
  const value = costMetadata(transaction.metadata).dollarAmount;
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
function eligible(transaction: ContributionTransaction) {
  return !transaction.description?.toLowerCase().includes('manual');
}
export function summarizeContribution(
  data: ContributionData,
  transactions: ContributionTransaction[],
  start: Date,
  end: Date,
) {
  const inPeriod = (at: string) =>
    Date.parse(at) >= start.getTime() && Date.parse(at) < end.getTime();
  const firstPurchase = new Map<string, number>();
  let netCollections = 0;
  for (const transaction of transactions) {
    if (!eligible(transaction)) continue;
    const dollars = cash(transaction);
    if (['purchase', 'topup'].includes(transaction.type) && dollars > 0) {
      firstPurchase.set(
        transaction.user_id,
        Math.min(
          firstPurchase.get(transaction.user_id) ?? Number.POSITIVE_INFINITY,
          Date.parse(transaction.created_at),
        ),
      );
      if (inPeriod(transaction.created_at)) netCollections += dollars;
    } else if (
      transaction.type === 'refund' &&
      classifyRefund(transaction) === 'refund' &&
      inPeriod(transaction.created_at)
    ) {
      netCollections -= Math.abs(dollars);
    }
  }
  const totals = { free: 0, paid: 0, unclassified: 0 };
  const bases = { estimated: 0, recorded: 0, unknown: 0 };
  const basisCosts = { estimated: 0, recorded: 0, unknown: 0 };
  const freeFeatures: Record<string, { credits: number; cost: number }> = {};
  let unclassified = 0;
  let callCost = 0;
  let shortCalls = 0;
  let missingCalls = 0;
  let legacyCalls = 0;
  for (const record of buildCostRecords(data)) {
    if (!inPeriod(record.at)) continue;
    let cohort: 'paid' | 'free' | 'unclassified' = 'unclassified';
    if (record.userId) {
      cohort =
        (firstPurchase.get(record.userId) ?? Number.POSITIVE_INFINITY) <=
        Date.parse(record.at)
          ? 'paid'
          : 'free';
    }
    totals[cohort] += record.cost.amount;
    bases[record.cost.basis]++;
    basisCosts[record.cost.basis] += record.cost.amount;
    if (cohort === 'unclassified') unclassified++;
    if (record.feature === 'live_call') callCost += record.cost.amount;
    if (record.supplemental === 'short') shortCalls++;
    if (record.supplemental === 'missing') missingCalls++;
    if (record.legacy) legacyCalls++;
    if (cohort === 'free') {
      const feature = freeFeatures[record.feature] ?? { cost: 0, credits: 0 };
      feature.credits += record.credits;
      feature.cost += record.cost.amount;
      freeFeatures[record.feature] = feature;
    }
  }
  const totalCost = totals.paid + totals.free + totals.unclassified;
  const incomplete = bases.unknown > 0 || unclassified > 0;
  return {
    bases,
    basisCosts,
    callCost,
    contribution: netCollections - totalCost,
    coverage:
      incomplete || totals.free === 0
        ? null
        : (netCollections - totals.paid) / totals.free,
    freeFeatures,
    incomplete,
    legacyCalls,
    missingCalls,
    netCollections,
    pendingCalls: data.calls.filter(
      (call) => !isFinalCall(call) && inPeriod(call.started_at),
    ).length,
    shortCalls,
    totalCost,
    totals,
    unclassified,
  };
}
export function formatContribution(
  label: string,
  summary: ReturnType<typeof summarizeContribution>,
): string[] {
  const usd = (value: number) => `$${value.toFixed(2)}`;
  let coverage =
    summary.coverage === null ? 'N/A' : `${summary.coverage.toFixed(2)}x`;
  if (summary.incomplete) coverage = 'incomplete';
  const gaps = [
    summary.bases.unknown > 0 ? `${summary.bases.unknown} unpriced` : null,
    summary.unclassified > 0 ? `${summary.unclassified} unclassified` : null,
  ].filter(Boolean);
  const gapLabel = gaps.length > 0 ? ` (${gaps.join(', ')})` : '';
  return [
    `- ${label}: ${usd(summary.netCollections)} net − ${usd(summary.totalCost)} usage = ${usd(summary.contribution)} left${gapLabel}`,
    `  Paid ${usd(summary.totals.paid)} | Free ${usd(summary.totals.free)} | Free coverage ${coverage}`,
  ];
}
