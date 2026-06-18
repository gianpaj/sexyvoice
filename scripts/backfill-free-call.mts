import { stdin as input, stdout as output } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

// Load environment variables
config({
  path: ['.env', '.env.local'],
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CliOptions {
  dryrun: boolean;
  limit?: number;
  help: boolean;
}

interface CallSession {
  id: string;
  user_id: string;
  started_at: string;
  free_call: boolean | null;
}

interface CreditTransaction {
  user_id: string;
  type: string;
  created_at: string;
}

interface UpdateResult {
  callId: string;
  userId: string;
  startedAt: string;
  previousValue: boolean | null;
  newValue: boolean;
  changed: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Supabase admin client
// ---------------------------------------------------------------------------

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
// Data fetching
// ---------------------------------------------------------------------------

/**
 * Fetch all call sessions ordered by started_at ascending.
 * Optionally limited to a max number of rows.
 */
async function fetchCallSessions(limit?: number): Promise<CallSession[]> {
  const supabase = createAdminClient();
  const results: CallSession[] = [];
  const BATCH_SIZE = 1000;

  let offset = 0;
  let remaining = limit ?? Number.POSITIVE_INFINITY;

  while (remaining > 0) {
    const batchSize = Math.min(BATCH_SIZE, remaining);
    const { data, error } = await supabase
      .from('call_sessions')
      .select('id, user_id, started_at, free_call')
      .order('started_at', { ascending: true })
      .range(offset, offset + batchSize - 1);

    if (error) {
      throw new Error(`Failed to fetch call_sessions: ${error.message}`);
    }

    const rows = (data ?? []) as CallSession[];
    results.push(...rows);

    if (rows.length < batchSize) {
      break;
    }

    offset += rows.length;
    remaining -= rows.length;
  }

  return results;
}

/**
 * Fetch all purchase/topup credit transactions for a set of user IDs.
 * Returns them grouped by user_id, each group sorted by created_at ascending.
 */
async function fetchPaidTransactions(
  userIds: string[],
): Promise<Map<string, CreditTransaction[]>> {
  const supabase = createAdminClient();
  const map = new Map<string, CreditTransaction[]>();

  if (userIds.length === 0) return map;

  // Supabase has a practical limit on .in() filter size, so batch in groups of 50
  const BATCH_SIZE = 50;

  for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
    const batch = userIds.slice(i, i + BATCH_SIZE);

    const { data, error } = await supabase
      .from('credit_transactions')
      .select('user_id, type, created_at')
      .in('user_id', batch)
      .in('type', ['purchase', 'topup'])
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch credit_transactions: ${error.message}`);
    }

    for (const tx of data ?? []) {
      const existing = map.get(tx.user_id) ?? [];
      existing.push(tx as CreditTransaction);
      map.set(tx.user_id, existing);
    }
  }

  return map;
}

// ---------------------------------------------------------------------------
// Core logic
// ---------------------------------------------------------------------------

/**
 * Determine whether a user had paid (purchase or topup) before a given date.
 */
function hadPaidBefore(
  transactions: CreditTransaction[] | undefined,
  beforeDate: string,
): boolean {
  if (!transactions || transactions.length === 0) return false;

  const before = new Date(beforeDate).getTime();

  return transactions.some((tx) => new Date(tx.created_at).getTime() < before);
}

/**
 * Process all call sessions and determine the correct free_call value.
 */
function computeUpdates(
  sessions: CallSession[],
  paidTxMap: Map<string, CreditTransaction[]>,
): UpdateResult[] {
  const results: UpdateResult[] = [];

  for (const session of sessions) {
    const userPaid = hadPaidBefore(
      paidTxMap.get(session.user_id),
      session.started_at,
    );
    // free_call = true when the user had NOT paid before the call
    const correctValue = !userPaid;
    const changed = session.free_call !== correctValue;

    results.push({
      callId: session.id,
      userId: session.user_id,
      startedAt: session.started_at,
      previousValue: session.free_call,
      newValue: correctValue,
      changed,
    });
  }

  return results;
}

/**
 * Apply the updates to the database.
 */
async function applyUpdates(results: UpdateResult[]): Promise<UpdateResult[]> {
  const supabase = createAdminClient();
  const toUpdate = results.filter((r) => r.changed);
  const BATCH_SIZE = 100;

  const applyBatch = async (
    ids: string[],
    newValue: boolean,
  ): Promise<void> => {
    if (ids.length === 0) return;

    const { error } = await supabase
      .from('call_sessions')
      .update({ free_call: newValue })
      .in('id', ids);

    if (error) {
      for (const id of ids) {
        const result = toUpdate.find((r) => r.callId === id);
        if (result) {
          result.error = error.message;
        }
      }
    }
  };

  const updatesToTrue = toUpdate.filter((r) => r.newValue === true);
  const updatesToFalse = toUpdate.filter((r) => r.newValue === false);

  for (let i = 0; i < updatesToTrue.length; i += BATCH_SIZE) {
    const batch = updatesToTrue.slice(i, i + BATCH_SIZE);
    await applyBatch(
      batch.map((r) => r.callId),
      true,
    );
  }

  for (let i = 0; i < updatesToFalse.length; i += BATCH_SIZE) {
    const batch = updatesToFalse.slice(i, i + BATCH_SIZE);
    await applyBatch(
      batch.map((r) => r.callId),
      false,
    );
  }

  return results;
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function displayEnvironmentWarning(): void {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('127.0.0.1')) {
    console.log('⚠️  WARNING: Using LOCAL Supabase URL\n');
  } else {
    console.log('⚠️  WARNING: Using PRODUCTION Supabase URL\n');
  }
}

function displaySummary(results: UpdateResult[], dryRun: boolean): void {
  const total = results.length;
  const changed = results.filter((r) => r.changed);
  const unchanged = results.filter((r) => !r.changed);
  const errors = results.filter((r) => r.error);
  const setToFree = changed.filter((r) => r.newValue === true);
  const setToPaid = changed.filter((r) => r.newValue === false);

  console.log(`\n${'='.repeat(60)}`);
  console.log(dryRun ? '  DRY RUN SUMMARY' : '  UPDATE SUMMARY');
  console.log('='.repeat(60));
  console.log(`  Total call sessions examined : ${total}`);
  console.log(`  Already correct (no change)  : ${unchanged.length}`);
  console.log(
    `  ${dryRun ? 'Would update' : 'Updated'}                 : ${changed.length}`,
  );
  console.log(`    → Set to free_call = true  : ${setToFree.length}`);
  console.log(`    → Set to free_call = false : ${setToPaid.length}`);

  if (errors.length > 0) {
    console.log(`  Errors                       : ${errors.length}`);
    for (const err of errors) {
      console.log(`    ✗ ${err.callId}: ${err.error}`);
    }
  }

  console.log('='.repeat(60));
}

function displayChanges(
  results: UpdateResult[],
  dryRun: boolean,
  includeUnchanged = false,
): void {
  const changed = results.filter((r) => r.changed);
  const unchanged = results.filter((r) => !r.changed);

  if (changed.length === 0 && !includeUnchanged) {
    console.log(
      '\n✅ All call sessions already have the correct free_call value.\n',
    );
    return;
  }

  const prefix = dryRun ? '[DRY RUN] ' : '';
  const pendingStatus = dryRun ? '' : '✓';

  if (changed.length > 0) {
    console.log(
      `\n${prefix}${dryRun ? 'Would update' : 'Updated'} ${changed.length} call session(s):\n`,
    );

    for (const r of changed) {
      const arrow = `${String(r.previousValue)} → ${r.newValue}`;
      const status = r.error ? `✗ ${r.error}` : pendingStatus;
      console.log(
        `  ${status} ${r.callId.slice(0, 8)}… | user ${r.userId.slice(0, 8)}… | ${formatTimestamp(r.startedAt)} | free_call: ${arrow}`,
      );
    }
  } else {
    console.log(`\n${prefix}Would update 0 call session(s).\n`);
  }

  if (includeUnchanged) {
    console.log(`\n${prefix}No change ${unchanged.length} call session(s):\n`);

    for (const r of unchanged) {
      const status = r.error ? `✗ ${r.error}` : '·';
      console.log(
        `  ${status} ${r.callId.slice(0, 8)}… | user ${r.userId.slice(0, 8)}… | ${formatTimestamp(r.startedAt)} | free_call: ${String(r.previousValue)}`,
      );
    }
  }
}

function displayHelp(): void {
  console.log(`
Usage: pnpm tsx scripts/backfill-free-call.mts [options]

Retroactively sets the free_call column on call_sessions based on whether the
user had a paid transaction (purchase or topup) before the call was created.

  free_call = true   → user had NOT paid before the call (free user)
  free_call = false  → user HAD paid before the call (paid user)

Options:
  -d, --dryrun           Run in dry-run mode (no database changes)
  -l, --limit <number>   Limit number of call sessions to process
  -h, --help             Show this help message

Examples:
  # Dry-run to see what would change
  pnpm tsx scripts/backfill-free-call.mts --dryrun

  # Dry-run first 10 records
  pnpm tsx scripts/backfill-free-call.mts --dryrun --limit 10

  # Apply changes (will prompt for confirmation)
  pnpm tsx scripts/backfill-free-call.mts
`);
}

// ---------------------------------------------------------------------------
// CLI parsing & prompts
// ---------------------------------------------------------------------------

function parseCliArgs(): CliOptions {
  try {
    const { values } = parseArgs({
      args: process.argv.slice(2),
      options: {
        dryrun: {
          type: 'boolean',
          short: 'd',
          default: false,
        },
        limit: {
          type: 'string',
          short: 'l',
        },
        help: {
          type: 'boolean',
          short: 'h',
          default: false,
        },
      },
      allowPositionals: false,
    });

    return {
      dryrun: values.dryrun as boolean,
      limit: values.limit
        ? Number.parseInt(values.limit as string, 10)
        : undefined,
      help: values.help as boolean,
    };
  } catch (error: unknown) {
    console.error(
      'Error parsing arguments:',
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  }
}

async function promptUser(
  rl: ReturnType<typeof createInterface>,
  question: string,
): Promise<string> {
  const answer = await rl.question(question);
  return answer.trim();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const options = parseCliArgs();

  if (options.help) {
    displayHelp();
    process.exit(0);
  }

  const rl = createInterface({ input, output });

  try {
    console.log('\n=== Backfill free_call on call_sessions ===\n');
    displayEnvironmentWarning();

    // 1. Fetch call sessions
    console.log(
      `Fetching call sessions${options.limit ? ` (limit: ${options.limit})` : ''}...`,
    );
    const sessions = await fetchCallSessions(options.limit);

    if (sessions.length === 0) {
      console.log('No call sessions found. Nothing to do.\n');
      rl.close();
      return;
    }

    console.log(`Found ${sessions.length} call session(s).\n`);

    // 2. Fetch paid transactions for all relevant users
    const userIds = [...new Set(sessions.map((s) => s.user_id))];
    console.log(
      `Fetching paid transactions for ${userIds.length} unique user(s)...`,
    );
    const paidTxMap = await fetchPaidTransactions(userIds);
    const usersWithPayments = [...paidTxMap.keys()].length;
    console.log(
      `Found ${usersWithPayments} user(s) with purchase/topup transactions.\n`,
    );

    // 3. Compute updates
    const results = computeUpdates(sessions, paidTxMap);
    const changedCount = results.filter((r) => r.changed).length;

    displayChanges(results, true, true);
    displaySummary(results, true);

    if (changedCount === 0) {
      rl.close();
      return;
    }

    // 4. If dry-run, stop here
    if (options.dryrun) {
      console.log(
        '\n💡 This was a dry run. No changes were made. Run without --dryrun to apply changes.\n',
      );
      rl.close();
      return;
    }

    // 5. Confirm before applying
    const confirm = await promptUser(
      rl,
      `\n⚠️  About to update ${changedCount} call session(s). Continue? (yes/no): `,
    );

    if (confirm.toLowerCase() !== 'yes') {
      console.log('\n❌ Operation cancelled.\n');
      rl.close();
      return;
    }

    // 6. Apply updates
    console.log(`\nApplying updates to ${changedCount} call session(s)...\n`);
    await applyUpdates(results);

    displayChanges(results, false);
    displaySummary(results, false);

    const errors = results.filter((r) => r.error);
    if (errors.length > 0) {
      console.log(
        `\n⚠️  ${errors.length} update(s) failed. See errors above.\n`,
      );
    } else {
      console.log('\n✅ All updates applied successfully!\n');
    }
  } catch (error: unknown) {
    console.error(
      '\n❌ Error:',
      error instanceof Error ? error.message : error,
      '\n',
    );
    process.exit(1);
  } finally {
    rl.close();
  }
}

main();
