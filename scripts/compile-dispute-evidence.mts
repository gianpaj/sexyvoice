import { writeFile } from 'node:fs/promises';
import { stdin as input, stdout as output } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

// Load environment variables
config({
  path: ['.env', '.env.local'],
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CreditTransaction {
  amount: number;
  created_at: string;
  description: string;
  id: string;
  metadata: {
    dollarAmount?: number;
    priceId?: string;
    chargeId?: string;
    [key: string]: unknown;
  } | null;
  reference_id: string | null;
  subscription_id: string | null;
  type: 'purchase' | 'topup' | 'usage' | 'freemium' | 'refund';
  user_id: string;
}

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
// Supabase
// ---------------------------------------------------------------------------

/**
 * Create Supabase admin client
 */
function createAdminClient() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    throw new Error('Missing env.NEXT_PUBLIC_SUPABASE_URL');
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing env.SUPABASE_SERVICE_ROLE_KEY');
  }

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}

// ---------------------------------------------------------------------------
// Data gathering (read-only, no side effects)
// ---------------------------------------------------------------------------

async function getAccount(
  supabase: ReturnType<typeof createAdminClient>,
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

async function getCreditTransactions(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string,
): Promise<CreditTransaction[]> {
  const { data, error } = await supabase
    .from('credit_transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch credit_transactions: ${error.message}`);
  }

  return (data ?? []) as CreditTransaction[];
}

async function getCurrentBalance(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from('credits')
    .select('amount')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch credits: ${error.message}`);
  }

  return data?.amount ?? 0;
}

async function getUsageSummary(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string,
): Promise<UsageSummaryRow[]> {
  const { data, error } = await supabase
    .from('usage_events')
    .select('source_type, quantity, credits_used, occurred_at')
    .eq('user_id', userId)
    .order('occurred_at', { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch usage_events: ${error.message}`);
  }

  const rows = (data ?? []) as {
    source_type: string;
    quantity: number | null;
    credits_used: number | null;
    occurred_at: string;
  }[];

  const bySource = new Map<string, UsageSummaryRow>();
  for (const row of rows) {
    const existing = bySource.get(row.source_type) ?? {
      sourceType: row.source_type,
      eventCount: 0,
      totalQuantity: 0,
      totalCreditsUsed: 0,
      firstOccurredAt: null,
      lastOccurredAt: null,
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
  supabase: ReturnType<typeof createAdminClient>,
  userId: string,
): Promise<AudioFilesSummary> {
  const { data, error } = await supabase
    .from('audio_files')
    .select('duration, credits_used, created_at, model')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch audio_files: ${error.message}`);
  }

  const rows = (data ?? []) as {
    duration: number | null;
    credits_used: number | null;
    created_at: string;
    model: string | null;
  }[];

  const models = [
    ...new Set(rows.map((r) => r.model).filter((m): m is string => !!m)),
  ].sort();

  // rows are ordered by created_at ascending; paid = credits_used > 0
  const paidRows = rows.filter((r) => (r.credits_used ?? 0) > 0);
  const freeRows = rows.filter((r) => (r.credits_used ?? 0) === 0);

  return {
    count: rows.length,
    totalDuration: rows.reduce((sum, r) => sum + Number(r.duration ?? 0), 0),
    totalCreditsUsed: rows.reduce((sum, r) => sum + (r.credits_used ?? 0), 0),
    firstCreatedAt: rows.length > 0 ? rows[0].created_at : null,
    lastCreatedAt: rows.at(-1)?.created_at ?? null,
    paidCount: paidRows.length,
    freeCount: freeRows.length,
    firstPaidCreatedAt: paidRows.length > 0 ? paidRows[0].created_at : null,
    lastPaidCreatedAt: paidRows.at(-1)?.created_at ?? null,
    firstFreeCreatedAt: freeRows.length > 0 ? freeRows[0].created_at : null,
    models,
  };
}

async function getVoiceCloneCount(
  supabase: ReturnType<typeof createAdminClient>,
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
  supabase: ReturnType<typeof createAdminClient>,
  userId: string,
): Promise<CallSessionsSummary> {
  const { data, error } = await supabase
    .from('call_sessions')
    .select('billed_minutes, duration_seconds, credits_used')
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Failed to fetch call_sessions: ${error.message}`);
  }

  const rows = (data ?? []) as {
    billed_minutes: number | null;
    duration_seconds: number | null;
    credits_used: number | null;
  }[];

  return {
    count: rows.length,
    totalBilledMinutes: rows.reduce((s, r) => s + (r.billed_minutes ?? 0), 0),
    totalDurationSeconds: rows.reduce(
      (s, r) => s + (r.duration_seconds ?? 0),
      0,
    ),
    totalCreditsUsed: rows.reduce((s, r) => s + (r.credits_used ?? 0), 0),
  };
}

/**
 * Fetch all data once into a single typed report object.
 */
async function gatherReport(userId: string): Promise<DisputeReport> {
  const supabase = createAdminClient();

  if (process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('127.0.0.1')) {
    console.warn('Using local Supabase URL');
  } else {
    console.warn('Using production Supabase URL');
  }

  const account = await getAccount(supabase, userId);

  const [
    transactions,
    currentBalance,
    usageSummary,
    audioFiles,
    voiceCloneCount,
    callSessions,
  ] = await Promise.all([
    getCreditTransactions(supabase, userId),
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
    generatedAt: new Date().toISOString(),
    account,
    payments,
    usageSummary,
    audioFiles,
    voiceCloneCount,
    callSessions,
    totals,
  };
}

function computeTotals(
  transactions: CreditTransaction[],
  usageSummary: UsageSummaryRow[],
  currentBalance: number,
): Totals {
  const isPaid = (t: CreditTransaction) =>
    t.type === 'purchase' || t.type === 'topup';

  // Gross amount charged via purchase/topup rows (positive dollarAmount).
  const totalChargedUSD = transactions
    .filter(isPaid)
    .reduce((sum, t) => sum + (t.metadata?.dollarAmount ?? 0), 0);

  // USD refunded back to the user. refund-credits.mts stores a NEGATIVE
  // metadata.dollarAmount on `type: 'refund'` rows for cash refunds (platform-
  // bug refunds are credits-only and carry no dollarAmount). Report as positive.
  const totalRefundedUSD =
    transactions
      .filter((t) => t.type === 'refund')
      .reduce((sum, t) => sum + Math.min(0, t.metadata?.dollarAmount ?? 0), 0) *
    -1;

  const netPaidUSD = totalChargedUSD - totalRefundedUSD;

  const totalPurchasedCredits = transactions
    .filter(isPaid)
    .reduce((sum, t) => sum + t.amount, 0);

  const totalFreemiumCredits = transactions
    .filter((t) => t.type === 'freemium')
    .reduce((sum, t) => sum + t.amount, 0);

  // refund amounts are signed (negative = credits taken back, positive = added)
  const totalRefundedCredits = transactions
    .filter((t) => t.type === 'refund')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalCreditsUsed = usageSummary.reduce(
    (sum, r) => sum + r.totalCreditsUsed,
    0,
  );

  const expectedBalance =
    totalPurchasedCredits +
    totalFreemiumCredits +
    totalRefundedCredits -
    totalCreditsUsed;

  return {
    totalChargedUSD,
    totalRefundedUSD,
    netPaidUSD,
    totalPurchasedCredits,
    totalFreemiumCredits,
    totalCreditsUsed,
    totalRefundedCredits,
    currentBalance,
    expectedBalance,
    balanceDelta: currentBalance - expectedBalance,
  };
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
      const usd =
        t.metadata?.dollarAmount == null
          ? 'N/A'
          : fmtUSD(t.metadata.dollarAmount);
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
      const usd =
        t.metadata?.dollarAmount == null
          ? 'N/A'
          : fmtUSD(t.metadata.dollarAmount);
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

async function getUserId(
  rl: ReturnType<typeof createInterface>,
): Promise<string> {
  let userId = process.argv[2];

  if (!userId) {
    userId = (await rl.question('Enter user ID: ')).trim();
  }

  if (!userId) {
    throw new Error('User ID is required');
  }

  return userId.replace(/[^a-zA-Z0-9-_]/g, '_');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const rl = createInterface({ input, output });

  try {
    const userId = await getUserId(rl);
    rl.close();

    console.log(`\nCompiling dispute evidence for user: ${userId}\n`);

    const report = await gatherReport(userId);

    renderConsole(report);

    const fileName = `dispute-${userId}-${report.generatedAt.slice(0, 10)}.md`;
    await writeFile(fileName, renderMarkdown(report), 'utf8');
    console.log(`📄 Markdown evidence written to: ${fileName}\n`);
  } catch (error) {
    console.error(
      '\n❌ Error:',
      Error.isError(error) ? error.message : error,
      '\n',
    );
    process.exit(1);
  } finally {
    rl.close();
  }
}

// Run the script
// biome-ignore lint/nursery/noFloatingPromises: fine for a script
main();
