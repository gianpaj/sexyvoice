import { readFileSync } from 'node:fs';
import { stdin as input, stdout as output } from 'node:process';
import { createInterface } from 'node:readline/promises';

import {
  inputPath,
  loadScriptEnv,
  parseCliArgs,
  runScript,
} from './lib/cli.mts';
import {
  adjustCredits,
  type CreditBalance,
  readBalances,
  readPaidUserIds,
} from './lib/ledger.mts';
import {
  createScriptAdminClient,
  type ScriptSupabaseClient,
} from './lib/supabase.mts';
import { UUID_PATTERN } from './lib/uuid.mts';

/** Balances under this are left alone. */
const MINIMUM_RESET_CREDITS = 50;

interface CliOptions {
  csvPath?: string;
  dryrun: boolean;
  help: boolean;
  limit?: number;
}

interface FreeloaderRecord {
  created_at: string;
  current_credits: number;
  id: string;
  total_credits_received: number;
  total_credits_used: number;
  usage_percentage: number;
  username: string;
}

interface ProcessingResult {
  error?: string;
  previousCredits: number;
  success: boolean;
  userId: string;
  username: string;
}

/**
 * Parse CSV file and extract freeloader records
 */
function parseCsvFile(filepath: string): FreeloaderRecord[] {
  try {
    const content = readFileSync(filepath, 'utf-8');
    const lines = content.trim().split('\n');

    if (lines.length < 2) {
      throw new Error('CSV file is empty or has no data rows');
    }

    // Skip header line
    const dataLines = lines.slice(1);
    const records: FreeloaderRecord[] = [];

    for (const line of dataLines) {
      // Handle CSV with potential commas in fields
      const parts = line.split(',');

      if (parts.length < 7) {
        console.warn(`Skipping malformed line: ${line}`);
        continue;
      }

      const record: FreeloaderRecord = {
        created_at: parts[2].trim(),
        current_credits: Number.parseFloat(parts[5].trim()),
        id: parts[0].trim(),
        total_credits_received: Number.parseFloat(parts[3].trim()),
        total_credits_used: Number.parseFloat(parts[4].trim()),
        usage_percentage: Number.parseFloat(parts[6].trim()),
        username: parts[1].trim(),
      };

      // Validate UUID format
      if (!UUID_PATTERN.test(record.id)) {
        console.warn(`Skipping invalid UUID: ${record.id}`);
        continue;
      }

      records.push(record);
    }

    return records;
  } catch (error) {
    throw new Error(
      `Failed to parse CSV file: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

interface Accounts {
  balances: Map<string, CreditBalance>;
  paid: Set<string>;
}

async function fetchAccounts(
  supabase: ScriptSupabaseClient,
  records: FreeloaderRecord[],
): Promise<Accounts> {
  const userIds = records.map((record) => record.id);
  console.log(
    `Fetching balances and payments for ${userIds.length} users...\n`,
  );
  const [balances, paid] = await Promise.all([
    readBalances(supabase, userIds),
    readPaidUserIds(supabase, userIds),
  ]);
  console.log(`✅ Fetched balances for ${balances.size} users\n`);
  return { balances, paid };
}

/**
 * Reset one user's balance to 0 with a ledger row. Paid users, empty
 * balances and balances under MINIMUM_RESET_CREDITS are skipped.
 */
async function processUser(
  supabase: ScriptSupabaseClient,
  record: FreeloaderRecord,
  accounts: Accounts,
  dryRun: boolean,
): Promise<ProcessingResult> {
  const balance = accounts.balances.get(record.id)?.amount;
  const result = {
    previousCredits: balance ?? 0,
    success: true,
    userId: record.id,
    username: record.username,
  };

  if (balance === undefined) {
    return {
      ...result,
      error: 'User not found in credits table',
      success: false,
    };
  }
  if (accounts.paid.has(record.id)) {
    return { ...result, error: 'Paid user' };
  }
  if (balance <= 0) {
    return { ...result, error: 'Already at 0 or negative' };
  }
  if (balance < MINIMUM_RESET_CREDITS) {
    return { ...result, error: `Under ${MINIMUM_RESET_CREDITS} credits` };
  }
  if (dryRun) {
    console.log(`  [DRY RUN] Would reset ${balance} credits to 0`);
    return result;
  }

  try {
    await adjustCredits(supabase, {
      amount: -balance,
      description: `Credit adjustment - Freeloader bug exploitation (${record.usage_percentage}% over limit)`,
      metadata: {
        automated: true,
        script: 'reset-freeloader-credits.mts',
        timestamp: new Date().toISOString(),
      },
      reason: 'freeloader_bug',
      userId: record.id,
    });
    return result;
  } catch (error) {
    return {
      ...result,
      error: error instanceof Error ? error.message : String(error),
      previousCredits: 0,
      success: false,
    };
  }
}

/**
 * Display summary statistics
 */
function displaySummary(results: ProcessingResult[]): void {
  const successful = results.filter((r) => r.success && !r.error);
  const skipped = results.filter((r) => r.success && r.error);
  const failed = results.filter((r) => !r.success);

  console.log('\n=== Processing Results ===\n');

  console.log('✅ Successfully reset:');
  for (const result of successful) {
    console.log(
      `  - ${result.username} (${result.userId}): ${result.previousCredits} credits → 0 credits`,
    );
  }

  if (skipped.length > 0) {
    console.log('\n⏭️  Skipped:');
    for (const result of skipped) {
      console.log(`  - ${result.username}: ${result.error}`);
    }
  }

  if (failed.length > 0) {
    console.log('\n❌ Failed:');
    for (const result of failed) {
      console.log(`  - ${result.username}: ${result.error}`);
    }
  }

  console.log('\n=== Summary ===');
  console.log(`Total: ${results.length}`);
  console.log(`Success: ${successful.length}`);
  console.log(`Skipped: ${skipped.length}`);
  console.log(`Failed: ${failed.length}`);
  console.log('');
}

/**
 * Prompt user for input
 */
async function promptUser(
  rl: ReturnType<typeof createInterface>,
  question: string,
): Promise<string> {
  const answer = await rl.question(question);
  return answer.trim();
}

/**
 * Parse CLI arguments
 */
function readOptions(): CliOptions {
  const { values, positionals } = parseCliArgs({
    allowPositionals: true,
    options: {
      dryrun: { default: false, short: 'd', type: 'boolean' },
      help: { default: false, short: 'h', type: 'boolean' },
      limit: { short: 'l', type: 'string' },
    },
  });

  return {
    csvPath: positionals[0],
    dryrun: values.dryrun,
    help: values.help,
    limit: values.limit ? Number.parseInt(values.limit, 10) : undefined,
  };
}

/**
 * Display help message
 */
function displayHelp(): void {
  console.log(`
Usage: pnpm reset-freeloader-credits [options] <csv-file>

Reset credits to 0 for users who exploited a bug where credits weren't deducted.
Paid users and balances under ${MINIMUM_RESET_CREDITS} credits are skipped; every reset
writes a refund ledger row.

Arguments:
  <csv-file>              Path to CSV file with freeloader data

Options:
  -d, --dryrun           Run in dry-run mode (no changes made)
  -l, --limit <number>   Limit number of records to process
  -h, --help             Show this help message

Examples:
  # Interactive mode (prompts for confirmation)
  pnpm reset-freeloader-credits freeloaders.csv

  # Dry-run mode
  pnpm reset-freeloader-credits --dryrun freeloaders.csv

  # Process only first 10 records
  pnpm reset-freeloader-credits --limit 10 freeloaders.csv

  # Dry-run with limit
  pnpm reset-freeloader-credits -d -l 5 freeloaders.csv

CSV Format:
  id,username,created_at,total_credits_received,total_credits_used,current_credits,usage_percentage
  uuid,email@example.com,2025-11-26 16:11:36+00,10000,11856,2464,118.56

`);
}

/**
 * Get CSV file path from args or prompt
 */
async function getCsvPath(
  rl: ReturnType<typeof createInterface>,
  cliCsvPath?: string,
): Promise<string> {
  let csvPath = cliCsvPath;

  if (!csvPath) {
    csvPath = await promptUser(rl, 'Enter path to CSV file: ');
  }

  if (!csvPath) {
    throw new Error('CSV file path is required');
  }

  return csvPath;
}

/**
 * Display records to be processed
 */
function displayRecords(records: FreeloaderRecord[], limit?: number): void {
  const total = records.length;
  const processing = limit ? Math.min(limit, total) : total;

  console.log(`Found ${total} freeloader records`);
  if (limit && limit < total) {
    console.log(
      `Will process first ${processing} records (--limit ${limit})\n`,
    );
  } else {
    console.log('');
  }

  console.log('Records to process:');
  const displayRecords = records.slice(0, processing);
  for (const record of displayRecords) {
    console.log(
      `  - ${record.username} | Current: ${record.current_credits} credits | Usage: ${record.usage_percentage}%`,
    );
  }
  console.log('');
}

/**
 * Get dry run confirmation
 */
async function getDryRunMode(
  rl: ReturnType<typeof createInterface>,
  cliDryrun: boolean,
): Promise<boolean> {
  // If CLI flag is set, use it
  if (cliDryrun) {
    console.log('Running in DRY-RUN mode (--dryrun flag)\n');
    return true;
  }

  const dryRunAnswer = await promptUser(
    rl,
    'Run in dry-run mode? (yes/no) [yes]: ',
  );
  return dryRunAnswer === '' || dryRunAnswer.toLowerCase() === 'yes';
}

/**
 * Get final confirmation for production run
 */
async function getFinalConfirmation(
  rl: ReturnType<typeof createInterface>,
): Promise<boolean> {
  console.log('\n⚠️  WARNING: This will PERMANENTLY reset credits to 0!');
  const confirm = await promptUser(rl, '\nType "RESET CREDITS" to confirm: ');
  return confirm === 'RESET CREDITS';
}

/**
 * Process all records with pre-fetched balances
 */
async function processRecords(
  supabase: ScriptSupabaseClient,
  records: FreeloaderRecord[],
  accounts: Accounts,
  dryRun: boolean,
): Promise<ProcessingResult[]> {
  const results: ProcessingResult[] = [];

  for (let i = 0; i < records.length; i++) {
    const record = records[i];

    console.log(
      `[${i + 1}/${records.length}] Processing ${record.username}...`,
    );

    const result = await processUser(supabase, record, accounts, dryRun);
    results.push(result);

    if (result.success && !result.error) {
      console.log(
        `  ✅ Success - Reset ${result.previousCredits} credits to 0`,
      );
    } else if (result.success && result.error) {
      console.log(`  ⏭️  Skipped - ${result.error} (${result.userId})`);
    } else {
      console.log(`  ❌ Failed (${result.userId}) - ${result.error}`);
    }
  }

  return results;
}

/**
 * Main function
 */
async function main() {
  const options = readOptions();

  if (options.help) {
    displayHelp();
    return;
  }

  loadScriptEnv();
  const supabase = createScriptAdminClient({ readOnly: options.dryrun });
  const rl = createInterface({ input, output });

  try {
    console.log('\n=== Reset Freeloader Credits ===\n');

    const csvPath = inputPath(await getCsvPath(rl, options.csvPath));
    console.log(`\nReading CSV file: ${csvPath}\n`);

    // Read and parse CSV
    let records = parseCsvFile(csvPath);

    if (records.length === 0) {
      console.log('❌ No records found in CSV file.\n');
      rl.close();
      return;
    }

    // Apply limit if specified
    if (options.limit && options.limit < records.length) {
      records = records.slice(0, options.limit);
    }

    // Display summary
    displayRecords(records, options.limit);

    const accounts = await fetchAccounts(supabase, records);

    const dryRun = await getDryRunMode(rl, options.dryrun);

    // Final confirmation for production
    if (!dryRun) {
      const confirmed = await getFinalConfirmation(rl);
      if (!confirmed) {
        console.log('\n❌ Operation cancelled.\n');
        rl.close();
        return;
      }
    }

    // Process records
    console.log(`\n${dryRun ? '[DRY RUN] ' : ''}Processing records...\n`);
    const results = await processRecords(supabase, records, accounts, dryRun);

    displaySummary(results);

    if (results.some((result) => !result.success)) {
      process.exitCode = 1;
    }
    if (dryRun) {
      console.log(
        '💡 This was a dry run. No changes were made. Run without --dryrun to apply changes.\n',
      );
    } else if (process.exitCode !== 1) {
      console.log('✅ All records processed successfully!\n');
    }
  } finally {
    rl.close();
  }
}

runScript(import.meta.url, main);
