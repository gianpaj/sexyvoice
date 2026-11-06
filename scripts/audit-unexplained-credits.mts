/// <reference path="../apps/web/lib/supabase/types.d.ts" />

import { rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  inputPath,
  loadScriptEnv,
  parseCliArgs,
  runScript,
} from './lib/cli.mts';
import {
  type CreditBalance,
  expectedBalance,
  readBalances,
  readCreditTransactions,
  readUsageEvents,
} from './lib/ledger.mts';
import {
  createScriptAdminClient,
  PAGE_SIZE,
  type ScriptSupabaseClient,
} from './lib/supabase.mts';

const USER_BATCH_SIZE = 50;
const DEFAULT_MIN_CREDITS = 50;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const AUDIT_SAFETY_LAG_MS = 5 * 60 * 1000;
const USAGE_EVENTS_MIGRATION_EPOCH = '2026-01-04T20:26:00.000Z';

type CreditClassification =
  | 'clean'
  | 'invalid_balance'
  | 'unspent'
  | 'used'
  | 'used_and_remaining';

type HistoryCoverage = 'partial_pre_usage_events' | 'recorded_events_only';

interface CliOptions {
  days?: number;
  help: boolean;
  limit?: number;
  minCredits: number;
  output?: string;
}

type ProfileRow = Pick<Tables<'profiles'>, 'created_at' | 'id' | 'username'>;

interface LedgerAggregate {
  lastTransactionAt: string | null;
  netCredits: number;
  transactionCount: number;
}

interface UsageAggregate {
  eventCount: number;
  lastUsageAt: string | null;
  recordedCredits: number;
}

export interface CreditReconciliationInput {
  currentBalance: number;
  netLedgerCredits: number;
  recordedUsage: number;
}

export interface CreditReconciliation {
  classification: CreditClassification;
  expectedBalance: number;
  minimumUnexplainedUsed: number;
  unexplainedGrants: number;
  unexplainedRemaining: number;
}

interface AuditRow extends CreditReconciliation {
  auditAsOf: string;
  balanceUpdatedAt: string | null;
  currentBalance: number;
  historyCoverage: HistoryCoverage;
  lastTransactionAt: string | null;
  lastUsageAt: string | null;
  netLedgerCredits: number;
  profileCreatedAt: string | null;
  recordedUsage: number;
  transactionCount: number;
  usageEventCount: number;
  userId: string;
  username: string;
  windowStart: string;
}

function assertFiniteNumber(name: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be a finite number`);
  }
}

export function reconcileCreditAccount(
  input: CreditReconciliationInput,
): CreditReconciliation {
  assertFiniteNumber('currentBalance', input.currentBalance);
  assertFiniteNumber('netLedgerCredits', input.netLedgerCredits);
  assertFiniteNumber('recordedUsage', input.recordedUsage);

  const currentBalance = Math.max(0, input.currentBalance);
  const recordedUsage = Math.max(0, input.recordedUsage);
  const expected = expectedBalance(input.netLedgerCredits, recordedUsage);
  const unexplainedGrants = Math.max(0, currentBalance - expected);
  const unexplainedRemaining = Math.min(currentBalance, unexplainedGrants);
  const minimumUnexplainedUsed = Math.max(
    0,
    unexplainedGrants - unexplainedRemaining,
  );

  let classification: CreditClassification = 'clean';
  if (input.currentBalance < 0) {
    classification = 'invalid_balance';
  } else if (minimumUnexplainedUsed > 0 && unexplainedRemaining > 0) {
    classification = 'used_and_remaining';
  } else if (minimumUnexplainedUsed > 0) {
    classification = 'used';
  } else if (unexplainedRemaining > 0) {
    classification = 'unspent';
  }

  return {
    classification,
    expectedBalance: Math.max(0, expected),
    minimumUnexplainedUsed,
    unexplainedGrants,
    unexplainedRemaining,
  };
}

function parsePositiveNumber(
  optionName: string,
  rawValue: string | undefined,
  options: { integer?: boolean; required?: boolean } = {},
): number | undefined {
  if (rawValue === undefined || rawValue === '') {
    if (options.required) {
      throw new Error(`${optionName} is required`);
    }
    return;
  }

  const value = Number(rawValue);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${optionName} must be greater than 0`);
  }
  if (options.integer && !Number.isInteger(value)) {
    throw new Error(`${optionName} must be an integer`);
  }

  return value;
}

function readOptions(): CliOptions {
  const { values } = parseCliArgs({
    options: {
      days: {
        type: 'string',
      },
      help: {
        default: false,
        short: 'h',
        type: 'boolean',
      },
      limit: {
        short: 'l',
        type: 'string',
      },
      'min-credits': {
        default: String(DEFAULT_MIN_CREDITS),
        type: 'string',
      },
      output: {
        short: 'o',
        type: 'string',
      },
    },
  });

  const help = values.help ?? false;
  if (help) {
    return {
      help: true,
      minCredits: DEFAULT_MIN_CREDITS,
    };
  }

  return {
    days: parsePositiveNumber('--days', values.days, { required: true }),
    help: false,
    limit: parsePositiveNumber('--limit', values.limit, { integer: true }),
    minCredits:
      parsePositiveNumber('--min-credits', values['min-credits']) ??
      DEFAULT_MIN_CREDITS,
    output: values.output,
  };
}

function displayHelp(): void {
  console.log(`
Usage:
  pnpm audit-unexplained-credits --days <number> [options]

Find recently changed credit balances that cannot be explained by recorded
credit transactions and usage events. This script is strictly read-only.

Options:
  --days <number>          Required lookback window in days
  --min-credits <number>  Minimum unexplained credits to report (default: 50)
  -l, --limit <number>    Limit recently changed balances scanned
  -o, --output <path>     CSV output path
  -h, --help              Show this help message

Examples:
  pnpm audit-unexplained-credits --days 3
  pnpm audit-unexplained-credits --days 7 --min-credits 100
  pnpm audit-unexplained-credits --days 1 --limit 25
`);
}

async function fetchRecentBalances(
  supabase: ScriptSupabaseClient,
  windowStart: string,
  auditAsOf: string,
  limit?: number,
): Promise<CreditBalance[]> {
  const rows: CreditBalance[] = [];
  let lastUserId: string | undefined;

  while (limit === undefined || rows.length < limit) {
    const remaining = limit === undefined ? PAGE_SIZE : limit - rows.length;
    const pageSize = Math.min(PAGE_SIZE, remaining);
    let query = supabase
      .from('credits')
      .select('user_id, amount, updated_at')
      .gte('updated_at', windowStart)
      .lte('updated_at', auditAsOf)
      .order('user_id', { ascending: true })
      .limit(pageSize);

    if (lastUserId) {
      query = query.gt('user_id', lastUserId);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(
        `Failed to fetch recent credit balances: ${error.message}`,
      );
    }

    const page = (data ?? []) as CreditBalance[];
    rows.push(...page);

    if (page.length < pageSize) break;
    lastUserId = page.at(-1)?.user_id;
    if (!lastUserId) break;
  }

  return rows;
}

function chunk<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

async function fetchProfiles(
  supabase: ScriptSupabaseClient,
  userIds: string[],
): Promise<Map<string, ProfileRow>> {
  const profiles = new Map<string, ProfileRow>();

  for (const userIdBatch of chunk(userIds, USER_BATCH_SIZE)) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, created_at')
      .in('id', userIdBatch);

    if (error) {
      throw new Error(`Failed to fetch profiles: ${error.message}`);
    }

    for (const profile of (data ?? []) as ProfileRow[]) {
      profiles.set(profile.id, profile);
    }
  }

  return profiles;
}

async function fetchLedgerAggregates(
  supabase: ScriptSupabaseClient,
  userIds: string[],
  auditAsOf: string,
): Promise<Map<string, LedgerAggregate>> {
  const aggregates = new Map<string, LedgerAggregate>();
  for (const userId of userIds) {
    aggregates.set(userId, {
      lastTransactionAt: null,
      netCredits: 0,
      transactionCount: 0,
    });
  }

  const batches = chunk(userIds, USER_BATCH_SIZE);
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
    const userIdBatch = batches[batchIndex];

    console.log(
      `  Credit transactions batch ${batchIndex + 1}/${batches.length}`,
    );

    const transactions = await readCreditTransactions(supabase, userIdBatch, {
      until: auditAsOf,
    });
    for (const transaction of transactions) {
      const aggregate = aggregates.get(transaction.user_id);
      if (!aggregate) continue;

      aggregate.netCredits += transaction.amount;
      aggregate.transactionCount += 1;
      if (
        aggregate.lastTransactionAt === null ||
        transaction.created_at > aggregate.lastTransactionAt
      ) {
        aggregate.lastTransactionAt = transaction.created_at;
      }
    }
  }

  return aggregates;
}

async function fetchUsageAggregates(
  supabase: ScriptSupabaseClient,
  userIds: string[],
  auditAsOf: string,
): Promise<Map<string, UsageAggregate>> {
  const aggregates = new Map<string, UsageAggregate>();
  for (const userId of userIds) {
    aggregates.set(userId, {
      eventCount: 0,
      lastUsageAt: null,
      recordedCredits: 0,
    });
  }

  const batches = chunk(userIds, USER_BATCH_SIZE);
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
    const userIdBatch = batches[batchIndex];

    console.log(`  Usage events batch ${batchIndex + 1}/${batches.length}`);

    const events = await readUsageEvents(supabase, userIdBatch, {
      until: auditAsOf,
    });
    for (const event of events) {
      const aggregate = aggregates.get(event.user_id);
      if (!aggregate) continue;

      aggregate.recordedCredits += event.credits_used;
      aggregate.eventCount += 1;
      if (
        aggregate.lastUsageAt === null ||
        event.occurred_at > aggregate.lastUsageAt
      ) {
        aggregate.lastUsageAt = event.occurred_at;
      }
    }
  }

  return aggregates;
}

export function escapeCsv(value: number | string | null): string {
  if (value === null) return '';

  // Only text can carry a formula; numbers such as -50 must stay numeric.
  const rawText = String(value);
  const text =
    typeof value === 'string' && /^[=+\-@\t\r]/.test(value)
      ? `'${value}`
      : rawText;
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

function createCsv(rows: AuditRow[]): string {
  const headers: Array<keyof AuditRow> = [
    'userId',
    'username',
    'profileCreatedAt',
    'historyCoverage',
    'windowStart',
    'auditAsOf',
    'balanceUpdatedAt',
    'currentBalance',
    'netLedgerCredits',
    'recordedUsage',
    'expectedBalance',
    'unexplainedGrants',
    'minimumUnexplainedUsed',
    'unexplainedRemaining',
    'classification',
    'transactionCount',
    'lastTransactionAt',
    'usageEventCount',
    'lastUsageAt',
  ];

  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((header) => escapeCsv(row[header])).join(','));
  }

  return `${lines.join('\n')}\n`;
}

function createDefaultOutputPath(days: number): string {
  const timestamp = new Date().toISOString().replaceAll(/[:.]/g, '-');
  return resolve(`unexplained-credits-${days}d-${timestamp}.csv`);
}

function buildAuditRows(
  balances: CreditBalance[],
  profiles: Map<string, ProfileRow>,
  ledgers: Map<string, LedgerAggregate>,
  usage: Map<string, UsageAggregate>,
  windowStart: string,
  auditAsOf: string,
  minCredits: number,
): AuditRow[] {
  const rows: AuditRow[] = [];

  for (const balance of balances) {
    const ledger = ledgers.get(balance.user_id) ?? {
      lastTransactionAt: null,
      netCredits: 0,
      transactionCount: 0,
    };
    const userUsage = usage.get(balance.user_id) ?? {
      eventCount: 0,
      lastUsageAt: null,
      recordedCredits: 0,
    };
    const reconciliation = reconcileCreditAccount({
      currentBalance: balance.amount ?? 0,
      netLedgerCredits: ledger.netCredits,
      recordedUsage: userUsage.recordedCredits,
    });

    if (
      reconciliation.classification !== 'invalid_balance' &&
      reconciliation.unexplainedGrants < minCredits
    ) {
      continue;
    }

    const profile = profiles.get(balance.user_id);
    const historyCoverage: HistoryCoverage =
      profile?.created_at && profile.created_at >= USAGE_EVENTS_MIGRATION_EPOCH
        ? 'recorded_events_only'
        : 'partial_pre_usage_events';

    rows.push({
      ...reconciliation,
      auditAsOf,
      balanceUpdatedAt: balance.updated_at,
      currentBalance: balance.amount ?? 0,
      historyCoverage,
      lastTransactionAt: ledger.lastTransactionAt,
      lastUsageAt: userUsage.lastUsageAt,
      netLedgerCredits: ledger.netCredits,
      profileCreatedAt: profile?.created_at ?? null,
      recordedUsage: userUsage.recordedCredits,
      transactionCount: ledger.transactionCount,
      usageEventCount: userUsage.eventCount,
      userId: balance.user_id,
      username: profile?.username ?? '(profile not found)',
      windowStart,
    });
  }

  return rows.sort(
    (left, right) => right.unexplainedGrants - left.unexplainedGrants,
  );
}

function displaySummary(
  rows: AuditRow[],
  candidateCount: number,
  stableCandidateCount: number,
  minCredits: number,
): void {
  const totalUnexplained = rows.reduce(
    (sum, row) => sum + row.unexplainedGrants,
    0,
  );
  const totalMinimumUsed = rows.reduce(
    (sum, row) => sum + row.minimumUnexplainedUsed,
    0,
  );
  const totalRemaining = rows.reduce(
    (sum, row) => sum + row.unexplainedRemaining,
    0,
  );

  console.log('\n=== Audit Summary ===');
  console.log(`Recently changed balances scanned: ${candidateCount}`);
  console.log(`Stable balances reconciled: ${stableCandidateCount}`);
  console.log(
    `Skipped after concurrent balance changes: ${candidateCount - stableCandidateCount}`,
  );
  console.log(`Flagged users (>= ${minCredits} credits): ${rows.length}`);
  console.log(`Estimated unexplained grants: ${totalUnexplained}`);
  console.log(`Minimum unexplained credits used: ${totalMinimumUsed}`);
  console.log(`Estimated unexplained credits remaining: ${totalRemaining}`);

  if (rows.length > 0) {
    console.table(
      rows.map((row) => ({
        classification: row.classification,
        current: row.currentBalance,
        expected: row.expectedBalance,
        history_coverage: row.historyCoverage,
        minimum_used: row.minimumUnexplainedUsed,
        net_ledger: row.netLedgerCredits,
        recorded_usage: row.recordedUsage,
        remaining: row.unexplainedRemaining,
        unexplained: row.unexplainedGrants,
        user_id: row.userId,
        username: row.username,
      })),
    );
  }
}

async function main(): Promise<void> {
  const options = readOptions();
  if (options.help) {
    displayHelp();
    return;
  }

  const days = options.days;
  if (days === undefined) {
    throw new Error('--days is required');
  }

  loadScriptEnv();
  const supabase = createScriptAdminClient({ readOnly: true });
  const auditAsOf = new Date(Date.now() - AUDIT_SAFETY_LAG_MS).toISOString();
  const windowStart = new Date(
    new Date(auditAsOf).getTime() - days * MILLISECONDS_PER_DAY,
  ).toISOString();

  console.log(`Window start: ${windowStart}`);
  console.log(`Audit cutoff: ${auditAsOf} (5-minute safety lag)`);
  console.log(`Minimum unexplained credits: ${options.minCredits}`);
  if (options.limit) {
    console.log(`Candidate limit: ${options.limit}`);
  }

  console.log('\nFetching recently changed balances...');
  const balances = await fetchRecentBalances(
    supabase,
    windowStart,
    auditAsOf,
    options.limit,
  );
  const userIds = balances.map((balance) => balance.user_id);
  console.log(`Found ${balances.length} recently changed balances.`);

  console.log('\nFetching profiles...');
  const profiles = await fetchProfiles(supabase, userIds);

  console.log('\nAggregating recorded credit transactions...');
  const ledgers = await fetchLedgerAggregates(supabase, userIds, auditAsOf);

  console.log('\nAggregating recorded usage events...');
  const usage = await fetchUsageAggregates(supabase, userIds, auditAsOf);

  console.log('\nRechecking balances for concurrent changes...');
  const currentBalances = await readBalances(supabase, userIds);
  const stableBalances = balances.filter((balance) => {
    const current = currentBalances.get(balance.user_id);
    return (
      current?.amount === balance.amount &&
      current.updated_at === balance.updated_at
    );
  });

  const rows = buildAuditRows(
    stableBalances,
    profiles,
    ledgers,
    usage,
    windowStart,
    auditAsOf,
    options.minCredits,
  );
  displaySummary(
    rows,
    balances.length,
    stableBalances.length,
    options.minCredits,
  );

  if (rows.length === 0) {
    console.log('\nNo users were flagged; no CSV report created.');
    return;
  }

  const outputPath = options.output
    ? inputPath(options.output)
    : createDefaultOutputPath(days);
  // Create the report owner-only from the first byte: `mode` only applies to a
  // new file, so replace any existing one instead of writing through it.
  await rm(outputPath, { force: true });
  await writeFile(outputPath, createCsv(rows), {
    encoding: 'utf8',
    flag: 'wx',
    mode: 0o600,
  });

  console.log(`\nCSV report: ${outputPath}`);
  console.log(
    '\nImportant: candidates are accounting anomalies, not proof of abuse. ' +
      'The report cannot detect forged matching ledger rows, historical ' +
      'under-debits, or missing usage events and opening balances.',
  );
}

runScript(import.meta.url, main);
