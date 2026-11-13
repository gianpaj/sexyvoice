import { writeFile } from 'node:fs/promises';
import { stdin as input, stdout as output } from 'node:process';
import { createInterface } from 'node:readline/promises';

import storageLayout from '../apps/web/lib/storage/layout.ts';
import { loadScriptEnv, parseCliArgs, runScript } from './lib/cli.mts';
import {
  type CreditTransaction,
  dollarAmount,
  readBalances,
  readCreditTransactions,
  readUsageEvents,
  summarizeLedger,
} from './lib/ledger.mts';
import {
  createScriptAdminClient,
  PAGE_SIZE,
  readAllRows,
  type ScriptSupabaseClient,
} from './lib/supabase.mts';
import { UUID_PATTERN } from './lib/uuid.mts';

const { AUDIO_FOLDERS } = storageLayout;
const FREE_FOLDERS = new Set<string>([
  AUDIO_FOLDERS.clone.free,
  AUDIO_FOLDERS.speech.free,
]);
const PAID_FOLDERS = new Set<string>([
  AUDIO_FOLDERS.clone.paid,
  AUDIO_FOLDERS.speech.paid,
]);

const HELP = `Compile one user's account, payments, usage and ledger reconciliation
for a Stripe dispute. Reads only; writes dispute-<user-id>-<date>.md to the
working directory.

Usage: pnpm compile-dispute-evidence [user-id]

Prompts for the user ID when it is not given.`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Account {
  created_at: string | null;
  id: string;
  stripe_id: string | null;
  username: string | null;
}

interface UsageSummaryRow {
  eventCount: number;
  firstOccurredAt: string | null;
  lastOccurredAt: string | null;
  sourceType: string;
  totalCreditsUsed: number;
  totalQuantity: number;
}

interface AudioFilesSummary {
  count: number;
  firstCreatedAt: string | null;
  firstFreeCreatedAt: string | null;
  firstPaidCreatedAt: string | null;
  freeCount: number;
  lastCreatedAt: string | null;
  lastPaidCreatedAt: string | null;
  models: string[];
  paidCount: number;
  totalCreditsUsed: number;
  totalDuration: number;
  unknownCount: number;
}

interface CallSessionsSummary {
  count: number;
  totalBilledMinutes: number;
  totalCreditsUsed: number;
  totalDurationSeconds: number;
}

interface Totals {
  balanceDelta: number;
  currentBalance: number;
  expectedBalance: number;
  netPaidUSD: number;
  totalChargedUSD: number;
  totalCreditsUsed: number;
  totalFreemiumCredits: number;
  totalPurchasedCredits: number;
  totalRefundedCredits: number;
  totalRefundedUSD: number;
}

interface DisputeReport {
  account: Account;
  audioFiles: AudioFilesSummary;
  callSessions: CallSessionsSummary;
  generatedAt: string;
  payments: CreditTransaction[];
  totals: Totals;
  usageSummary: UsageSummaryRow[];
  voiceCloneCount: number;
}

// ---------------------------------------------------------------------------
// Data gathering (read-only, no side effects)
// ---------------------------------------------------------------------------

async function getAccount(
  supabase: ScriptSupabaseClient,
  userId: string,
): Promise<Account> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, stripe_id, created_at')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch profiles: ${error.message}`);
  }
  if (!data) {
    throw new Error(`User not found in profiles: ${userId}`);
  }

  return data as Account;
}

async function getCurrentBalance(
  supabase: ScriptSupabaseClient,
  userId: string,
): Promise<number> {
  const balances = await readBalances(supabase, [userId]);
  return balances.get(userId)?.amount ?? 0;
}

async function getUsageSummary(
  supabase: ScriptSupabaseClient,
  userId: string,
): Promise<UsageSummaryRow[]> {
  const rows = await readUsageEvents(supabase, [userId]);

  const bySource = new Map<string, UsageSummaryRow>();
  for (const row of rows) {
    const existing = bySource.get(row.source_type) ?? {
      eventCount: 0,
      firstOccurredAt: null,
      lastOccurredAt: null,
      sourceType: row.source_type,
      totalCreditsUsed: 0,
      totalQuantity: 0,
    };
    existing.eventCount += 1;
    existing.totalQuantity += Number(row.quantity ?? 0);
    existing.totalCreditsUsed += row.credits_used ?? 0;
    if (!existing.firstOccurredAt) {
      existing.firstOccurredAt = row.occurred_at;
    }
    existing.lastOccurredAt = row.occurred_at;
    bySource.set(row.source_type, existing);
  }

  return [...bySource.values()].sort((a, b) =>
    a.sourceType.localeCompare(b.sourceType),
  );
}

async function getAudioFilesSummary(
  supabase: ScriptSupabaseClient,
  userId: string,
): Promise<AudioFilesSummary> {
  const rows = (
    await readAllRows('audio_files', (afterId) => {
      let query = supabase
        .from('audio_files')
        .select(
          'id, duration, credits_used, created_at, model, storage_key, usage',
        )
        .eq('user_id', userId)
        .order('id')
        .limit(PAGE_SIZE);
      if (afterId) query = query.gt('id', afterId);
      return query;
    })
  ).sort((left, right) =>
    (left.created_at ?? '').localeCompare(right.created_at ?? ''),
  );

  const models = [
    ...new Set(rows.map((r) => r.model).filter((m): m is string => !!m)),
  ].sort();

  // Paid/free reflects whether the user was a paying customer when the file was
  // generated — NOT whether credits were consumed (credits_used is set for free
  // users too). The signal is captured at generation time as usage.userHasPaid,
  // and mirrored in the storage_key folder (AUDIO_FOLDERS), used as a fallback
  // for rows predating the flag.
  const isPaidRow = (r: (typeof rows)[number]): boolean | null => {
    const userHasPaid =
      r.usage && typeof r.usage === 'object' && !Array.isArray(r.usage)
        ? r.usage.userHasPaid
        : undefined;
    if (typeof userHasPaid === 'boolean') {
      return userHasPaid;
    }
    const folder = (r.storage_key ?? '').split('/')[0];
    if (FREE_FOLDERS.has(folder)) {
      return false;
    }
    if (PAID_FOLDERS.has(folder)) {
      return true;
    }
    return null;
  };

  // rows are ordered by created_at ascending
  const paidRows = rows.filter((r) => isPaidRow(r) === true);
  const freeRows = rows.filter((r) => isPaidRow(r) === false);
  const unknownCount = rows.filter((r) => isPaidRow(r) === null).length;

  return {
    count: rows.length,
    firstCreatedAt: rows.length > 0 ? rows[0].created_at : null,
    firstFreeCreatedAt: freeRows.length > 0 ? freeRows[0].created_at : null,
    firstPaidCreatedAt: paidRows.length > 0 ? paidRows[0].created_at : null,
    freeCount: freeRows.length,
    lastCreatedAt: rows.at(-1)?.created_at ?? null,
    lastPaidCreatedAt: paidRows.at(-1)?.created_at ?? null,
    models,
    paidCount: paidRows.length,
    totalCreditsUsed: rows.reduce((sum, r) => sum + (r.credits_used ?? 0), 0),
    totalDuration: rows.reduce((sum, r) => sum + Number(r.duration ?? 0), 0),
    unknownCount,
  };
}

async function getVoiceCloneCount(
  supabase: ScriptSupabaseClient,
  userId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from('voices')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Failed to fetch voices: ${error.message}`);
  }

  return count ?? 0;
}

async function getCallSessionsSummary(
  supabase: ScriptSupabaseClient,
  userId: string,
): Promise<CallSessionsSummary> {
  const rows = await readAllRows('call_sessions', (afterId) => {
    let query = supabase
      .from('call_sessions')
      .select('id, billed_minutes, duration_seconds, credits_used')
      .eq('user_id', userId)
      .order('id')
      .limit(PAGE_SIZE);
    if (afterId) query = query.gt('id', afterId);
    return query;
  });

  return {
    count: rows.length,
    totalBilledMinutes: rows.reduce((s, r) => s + (r.billed_minutes ?? 0), 0),
    totalCreditsUsed: rows.reduce((s, r) => s + (r.credits_used ?? 0), 0),
    totalDurationSeconds: rows.reduce(
      (s, r) => s + (r.duration_seconds ?? 0),
      0,
    ),
  };
}

/**
 * Fetch all data once into a single typed report object.
 */
async function gatherReport(
  supabase: ScriptSupabaseClient,
  userId: string,
): Promise<DisputeReport> {
  const account = await getAccount(supabase, userId);

  const [
    transactions,
    currentBalance,
    usageSummary,
    audioFiles,
    voiceCloneCount,
    callSessions,
  ] = await Promise.all([
    readCreditTransactions(supabase, [userId]),
    getCurrentBalance(supabase, userId),
    getUsageSummary(supabase, userId),
    getAudioFilesSummary(supabase, userId),
    getVoiceCloneCount(supabase, userId),
    getCallSessionsSummary(supabase, userId),
  ]);

  const payments = transactions.filter(
    (t) => t.type === 'purchase' || t.type === 'topup' || t.type === 'refund',
  );

  const totals = computeTotals(transactions, usageSummary, currentBalance);

  return {
    account,
    audioFiles,
    callSessions,
    generatedAt: new Date().toISOString(),
    payments,
    totals,
    usageSummary,
    voiceCloneCount,
  };
}

function computeTotals(
  transactions: CreditTransaction[],
  usageSummary: UsageSummaryRow[],
  currentBalance: number,
): Totals {
  const ledger = summarizeLedger(
    transactions,
    usageSummary.reduce((sum, r) => sum + r.totalCreditsUsed, 0),
    currentBalance,
  );

  return {
    balanceDelta: ledger.delta,
    currentBalance,
    expectedBalance: ledger.expected,
    netPaidUSD: ledger.charged - ledger.cashRefunded,
    totalChargedUSD: ledger.charged,
    totalCreditsUsed: ledger.creditsUsed,
    totalFreemiumCredits: ledger.freemium,
    totalPurchasedCredits: ledger.purchased,
    totalRefundedCredits: ledger.refundsAdded - ledger.refundsRemoved,
    totalRefundedUSD: ledger.cashRefunded,
  };
}

function formatPaymentDollars(transaction: CreditTransaction): string {
  const dollars = dollarAmount(transaction);
  return dollars === undefined ? 'N/A' : fmtUSD(dollars);
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function fmtDate(value: string | null): string {
  return value ? value.slice(0, 10) : 'N/A';
}

function fmtUSD(value: number): string {
  return `$${value.toFixed(2)}`;
}

function renderConsole(report: DisputeReport): void {
  const { account, payments, usageSummary, audioFiles, callSessions, totals } =
    report;

  console.log('\n=== Stripe Dispute Evidence ===\n');
  console.log(`Generated:        ${report.generatedAt}`);
  console.log(`User ID:          ${account.id}`);
  console.log(`Email:            ${account.username ?? 'N/A'}`);
  console.log(`Stripe Customer:  ${account.stripe_id ?? 'N/A'}`);
  console.log(`Account Created:  ${fmtDate(account.created_at)}`);

  console.log('\n--- Payments ---');
  if (payments.length === 0) {
    console.log('  (no purchase/topup/refund transactions)');
  } else {
    for (const t of payments) {
      const usd = formatPaymentDollars(t);
      console.log(
        `  ${fmtDate(t.created_at)} | ${t.type.toUpperCase().padEnd(8)} | ${String(t.amount).padStart(7)} credits | ${usd.padStart(9)} | PI: ${t.reference_id ?? 'N/A'}${t.subscription_id ? ` | Sub: ${t.subscription_id}` : ''}`,
      );
    }
  }

  console.log('\n--- Usage (usage_events, by source) ---');
  if (usageSummary.length === 0) {
    console.log('  (no usage events)');
  } else {
    for (const u of usageSummary) {
      console.log(
        `  ${u.sourceType.padEnd(18)} | ${String(u.eventCount).padStart(5)} events | ${String(u.totalCreditsUsed).padStart(7)} credits | qty ${u.totalQuantity} | ${fmtDate(u.firstOccurredAt)} → ${fmtDate(u.lastOccurredAt)}`,
      );
    }
  }

  console.log('\n--- Delivered Artifacts ---');
  console.log(
    `  Audio files:    ${audioFiles.count} (total ${audioFiles.totalDuration.toFixed(1)}s, ${audioFiles.totalCreditsUsed} credits)`,
  );
  console.log(
    `    Date range:   ${fmtDate(audioFiles.firstCreatedAt)} → ${fmtDate(audioFiles.lastCreatedAt)}`,
  );
  console.log(
    `    Paid (${String(audioFiles.paidCount).padStart(3)}):    ${fmtDate(audioFiles.firstPaidCreatedAt)} → ${fmtDate(audioFiles.lastPaidCreatedAt)} (first → last)`,
  );
  console.log(
    `    Free (${String(audioFiles.freeCount).padStart(3)}):    first ${fmtDate(audioFiles.firstFreeCreatedAt)}`,
  );
  if (audioFiles.unknownCount > 0) {
    console.log(
      `    Unknown (${String(audioFiles.unknownCount).padStart(3)}): paid/free could not be determined`,
    );
  }
  console.log(
    `    Models:       ${audioFiles.models.length > 0 ? audioFiles.models.join(', ') : 'N/A'}`,
  );
  console.log(`  Voice clones:   ${report.voiceCloneCount}`);
  console.log(
    `  Call sessions:  ${callSessions.count} (${callSessions.totalBilledMinutes} billed min, ${callSessions.totalDurationSeconds}s, ${callSessions.totalCreditsUsed} credits)`,
  );

  console.log('\n--- Totals & Reconciliation ---');
  console.log(`  Total charged (gross): ${fmtUSD(totals.totalChargedUSD)}`);
  console.log(`  USD refunded:          ${fmtUSD(totals.totalRefundedUSD)}`);
  console.log(`  Net paid:              ${fmtUSD(totals.netPaidUSD)}`);
  console.log(`  Credits purchased:     ${totals.totalPurchasedCredits}`);
  console.log(`  Freemium credits:      ${totals.totalFreemiumCredits}`);
  console.log(`  Credits used:          ${totals.totalCreditsUsed}`);
  console.log(`  Refund adjustment:     ${totals.totalRefundedCredits}`);
  console.log(`  Current balance:       ${totals.currentBalance}`);
  console.log(
    `  Expected balance:      ${totals.expectedBalance} (purchased + freemium + refunds − used)`,
  );
  console.log(
    `  Delta (actual − exp):  ${totals.balanceDelta}${totals.balanceDelta === 0 ? ' ✅' : ' ⚠️'}`,
  );
  console.log('');
}

function renderMarkdown(report: DisputeReport): string {
  const { account, payments, usageSummary, audioFiles, callSessions, totals } =
    report;

  const lines: string[] = [];
  lines.push(`# Stripe Dispute Evidence — ${account.username ?? account.id}`);
  lines.push('');
  lines.push(`- **Generated:** ${report.generatedAt}`);
  lines.push(`- **User ID:** \`${account.id}\``);
  lines.push(`- **Email:** ${account.username ?? 'N/A'}`);
  lines.push(`- **Stripe Customer:** \`${account.stripe_id ?? 'N/A'}\``);
  lines.push(`- **Account Created:** ${fmtDate(account.created_at)}`);
  lines.push('');

  lines.push('## Payments');
  lines.push('');
  if (payments.length === 0) {
    lines.push('_No purchase/topup/refund transactions._');
  } else {
    lines.push(
      '| Date | Type | Credits | USD | Payment Intent | Subscription |',
    );
    lines.push('| --- | --- | ---: | ---: | --- | --- |');
    for (const t of payments) {
      const usd = formatPaymentDollars(t);
      lines.push(
        `| ${fmtDate(t.created_at)} | ${t.type} | ${t.amount} | ${usd} | \`${t.reference_id ?? 'N/A'}\` | ${t.subscription_id ? `\`${t.subscription_id}\`` : 'N/A'} |`,
      );
    }
  }
  lines.push('');

  lines.push('## Usage (from `usage_events`)');
  lines.push('');
  if (usageSummary.length === 0) {
    lines.push('_No usage events._');
  } else {
    lines.push(
      '| Source | Events | Credits Used | Total Quantity | First | Last |',
    );
    lines.push('| --- | ---: | ---: | ---: | --- | --- |');
    for (const u of usageSummary) {
      lines.push(
        `| ${u.sourceType} | ${u.eventCount} | ${u.totalCreditsUsed} | ${u.totalQuantity} | ${fmtDate(u.firstOccurredAt)} | ${fmtDate(u.lastOccurredAt)} |`,
      );
    }
  }
  lines.push('');

  lines.push('## Delivered Artifacts');
  lines.push('');
  lines.push('| Type | Count | Detail |');
  lines.push('| --- | ---: | --- |');
  lines.push(
    `| Audio files | ${audioFiles.count} | ${audioFiles.totalDuration.toFixed(1)}s total, ${audioFiles.totalCreditsUsed} credits, ${fmtDate(audioFiles.firstCreatedAt)} → ${fmtDate(audioFiles.lastCreatedAt)}; models: ${audioFiles.models.join(', ') || 'N/A'} |`,
  );
  lines.push(
    `| Audio files (paid) | ${audioFiles.paidCount} | first ${fmtDate(audioFiles.firstPaidCreatedAt)} → last ${fmtDate(audioFiles.lastPaidCreatedAt)} |`,
  );
  lines.push(
    `| Audio files (free) | ${audioFiles.freeCount} | first ${fmtDate(audioFiles.firstFreeCreatedAt)} |`,
  );
  if (audioFiles.unknownCount > 0) {
    lines.push(
      `| Audio files (unknown) | ${audioFiles.unknownCount} | paid/free could not be determined |`,
    );
  }
  lines.push(`| Voice clones | ${report.voiceCloneCount} | created by user |`);
  lines.push(
    `| Call sessions | ${callSessions.count} | ${callSessions.totalBilledMinutes} billed min, ${callSessions.totalDurationSeconds}s, ${callSessions.totalCreditsUsed} credits |`,
  );
  lines.push('');

  lines.push('## Totals & Reconciliation');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('| --- | ---: |');
  lines.push(`| Total charged (gross) | ${fmtUSD(totals.totalChargedUSD)} |`);
  lines.push(`| USD refunded | ${fmtUSD(totals.totalRefundedUSD)} |`);
  lines.push(`| Net paid | ${fmtUSD(totals.netPaidUSD)} |`);
  lines.push(`| Credits purchased | ${totals.totalPurchasedCredits} |`);
  lines.push(`| Freemium credits | ${totals.totalFreemiumCredits} |`);
  lines.push(`| Credits used | ${totals.totalCreditsUsed} |`);
  lines.push(`| Refund adjustment | ${totals.totalRefundedCredits} |`);
  lines.push(`| Current balance | ${totals.currentBalance} |`);
  lines.push(`| Expected balance | ${totals.expectedBalance} |`);
  lines.push(`| Delta (actual − expected) | ${totals.balanceDelta} |`);
  lines.push('');
  lines.push(
    '_Expected balance = purchased + freemium + refund adjustment − credits used._',
  );
  lines.push('');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

async function getUserId(argument: string | undefined): Promise<string> {
  let userId = argument;
  if (!userId) {
    const rl = createInterface({ input, output });
    try {
      userId = (await rl.question('Enter user ID: ')).trim();
    } finally {
      rl.close();
    }
  }

  if (!(userId && UUID_PATTERN.test(userId))) {
    throw new Error('Provide the user ID as a UUID');
  }
  return userId;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const { positionals, values } = parseCliArgs({
    allowPositionals: true,
    options: { help: { default: false, short: 'h', type: 'boolean' } },
  });
  if (values.help) {
    console.log(HELP);
    return;
  }
  if (positionals.length > 1) {
    throw new Error(`Expected at most one user ID.\n\n${HELP}`);
  }

  const userId = await getUserId(positionals[0]);
  loadScriptEnv();
  const supabase = createScriptAdminClient({ readOnly: true });

  console.log(`\nCompiling dispute evidence for user: ${userId}\n`);

  const report = await gatherReport(supabase, userId);

  renderConsole(report);

  const fileName = `dispute-${userId}-${report.generatedAt.slice(0, 10)}.md`;
  await writeFile(fileName, renderMarkdown(report), 'utf8');
  console.log(`📄 Markdown evidence written to: ${fileName}\n`);
}

runScript(import.meta.url, main);
