import { readFileSync } from 'node:fs';
import { stdin as input, stdout as output } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

// Load environment variables
config({
  path: ['.env', '.env.local'],
});

// UUID validation regex at top level for performance
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Batch size for fetching credit balances
const BATCH_SIZE = 10;

interface CliOptions {
  csvPath?: string;
  dryrun: boolean;
  limit?: number;
  help: boolean;
}

interface FreeloaderRecord {
  id: string;
  username: string;
  created_at: string;
  total_credits_received: number;
  total_credits_used: number;
  current_credits: number;
  usage_percentage: number;
}

interface ProcessingResult {
  userId: string;
  username: string;
  previousCredits: number;
  success: boolean;
  error?: string;
}

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
        persistSession: true,
      },
    },
  );
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
        id: parts[0].trim(),
        username: parts[1].trim(),
        created_at: parts[2].trim(),
        total_credits_received: Number.parseFloat(parts[3].trim()),
        total_credits_used: Number.parseFloat(parts[4].trim()),
        current_credits: Number.parseFloat(parts[5].trim()),
        usage_percentage: Number.parseFloat(parts[6].trim()),
      };

      // Validate UUID format
      if (!UUID_REGEX.test(record.id)) {
        console.warn(`Skipping invalid UUID: ${record.id}`);
        continue;
      }

      records.push(record);
    }

    return records;
  } catch (error) {
    throw new Error(
      `Failed to parse CSV file: ${error instanceof Error ? error.message : error}`,
    );
  }
}

/**
 * Get credit balances for multiple users in a single query
 */
async function getUserCreditBalancesBatch(
  userIds: string[],
): Promise<Map<string, number | null>> {
  const supabase = createAdminClient();
  const balanceMap = new Map<string, number | null>();

  // Initialize all users as not found
  for (const userId of userIds) {
    balanceMap.set(userId, null);
  }

  if (userIds.length === 0) {
    return balanceMap;
  }

  const { data, error } = await supabase
    .from('credits')
    .select('user_id, amount')
    .in('user_id', userIds);

  if (error) {
    throw new Error(`Failed to fetch credit balances: ${error.message}`);
  }

  // Update map with actual balances
  if (data) {
    for (const record of data) {
      balanceMap.set(record.user_id, record.amount ?? 0);
    }
  }

  return balanceMap;
}

/**
 * Get credit balances for all records in batches
 */
async function getAllCreditBalances(
  records: FreeloaderRecord[],
): Promise<Map<string, number | null>> {
  const allBalances = new Map<string, number | null>();
  const userIds = records.map((r) => r.id);

  console.log(`Fetching credit balances in batches of ${BATCH_SIZE}...\n`);

  for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
    const batch = userIds.slice(i, i + BATCH_SIZE);
    const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(userIds.length / BATCH_SIZE);

    console.log(
      `  Fetching batch ${batchNumber}/${totalBatches} (${batch.length} users)...`,
    );

    const balances = await getUserCreditBalancesBatch(batch);

    // Merge batch results into all balances
    balances.forEach((balance, userId) => {
      allBalances.set(userId, balance);
    });
  }

  console.log(`✅ Fetched balances for ${allBalances.size} users\n`);
  return allBalances;
}

/**
 * Reset user credits to zero
 */
async function resetUserCredits(
  userId: string,
  currentCredits: number,
): Promise<void> {
  const supabase = createAdminClient();

  if (currentCredits < 50) {
    console.log('  → User already less than 50 credits, skipping');
    return;
  }

  // Use the decrement function to set credits to 0
  const { error } = await supabase.rpc('decrement_user_credits', {
    user_id_var: userId,
    credit_amount_var: Math.abs(currentCredits),
  });

  if (error) {
    throw new Error(`Failed to reset credits: ${error.message}`);
  }
}

/**
 * Insert adjustment transaction for audit trail
 */
async function insertAdjustmentTransaction(
  userId: string,
  creditAmount: number,
  reason: string,
): Promise<void> {
  const supabase = createAdminClient();

  const { error } = await supabase.from('credit_transactions').insert({
    user_id: userId,
    amount: -Math.abs(creditAmount),
    type: 'refund',
    description: reason,
    metadata: {
      automated: true,
      script: 'reset-freeloader-credits.ts',
      timestamp: new Date().toISOString(),
    },
  });

  if (error) {
    throw new Error(`Failed to insert transaction: ${error.message}`);
  }
}

/**
 * Process a single user with pre-fetched balance
 */
async function processUser(
  record: FreeloaderRecord,
  currentBalance: number | null,
  dryRun: boolean,
  insertTransaction: boolean,
): Promise<ProcessingResult> {
  try {
    if (currentBalance === null) {
      return {
        userId: record.id,
        username: record.username,
        previousCredits: 0,
        success: false,
        error: 'User not found in credits table',
      };
    }

    if (currentBalance <= 0) {
      return {
        userId: record.id,
        username: record.username,
        previousCredits: currentBalance,
        success: true,
        error: 'Already at 0 or negative',
      };
    }

    if (dryRun) {
      console.log(`  [DRY RUN] Would reset ${currentBalance} credits to 0`);
      return {
        userId: record.id,
        username: record.username,
        previousCredits: currentBalance,
        success: true,
      };
    }

    await resetUserCredits(record.id, currentBalance);

    // Optionally insert transaction record for audit trail
    if (insertTransaction && currentBalance > 0) {
      await insertAdjustmentTransaction(
        record.id,
        currentBalance,
        `Credit adjustment - Freeloader bug exploitation (${record.usage_percentage}% over limit)`,
      );
    }

    return {
      userId: record.id,
      username: record.username,
      previousCredits: currentBalance,
      success: true,
    };
  } catch (error) {
    return {
      userId: record.id,
      username: record.username,
      previousCredits: 0,
      success: false,
      error: error instanceof Error ? error.message : String(error),
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
    console.log('\n⏭️  Skipped (already at 0):');
    for (const result of skipped) {
      console.log(`  - ${result.username}`);
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
function parseCliArgs(): CliOptions {
  try {
    const { values, positionals } = parseArgs({
      args: process.argv.slice(2),
      options: {
        dryrun: {
          type: 'boolean',
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
      allowPositionals: true,
    });

    return {
      csvPath: positionals[0],
      dryrun: values.dryrun as boolean,
      limit: values.limit
        ? Number.parseInt(values.limit as string, 10)
        : undefined,
      help: values.help as boolean,
    };
  } catch (error) {
    console.error('Error parsing arguments:', error);
    process.exit(1);
  }
}

/**
 * Display help message
 */
function displayHelp(): void {
  console.log(`
Usage: pnpm tsx scripts/reset-freeloader-credits.ts [options] <csv-file>

Reset credits to 0 for users who exploited a bug where credits weren't deducted.

Arguments:
  <csv-file>              Path to CSV file with freeloader data

Options:
  -d, --dryrun           Run in dry-run mode (no changes made)
  -l, --limit <number>   Limit number of records to process
  -h, --help             Show this help message

Examples:
  # Interactive mode (prompts for confirmation)
  pnpm tsx scripts/reset-freeloader-credits.ts freeloaders.csv

  # Dry-run mode
  pnpm tsx scripts/reset-freeloader-credits.ts --dryrun freeloaders.csv

  # Process only first 10 records
  pnpm tsx scripts/reset-freeloader-credits.ts --limit 10 freeloaders.csv

  # Dry-run with limit
  pnpm tsx scripts/reset-freeloader-credits.ts -d -l 5 freeloaders.csv

CSV Format:
  id,username,created_at,total_credits_received,total_credits_used,current_credits,usage_percentage
  uuid,email@example.com,2025-11-26 16:11:36+00,10000,11856,2464,118.56

Features:
  - Batch credit balance fetching (10 users per query)
  - Dry-run mode for safe testing
  - Limit records for testing
  - Detailed progress reporting
  - Optional audit trail logging
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
 * Display environment warning
 */
function displayEnvironmentWarning(): void {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('127.0.0.1')) {
    console.log('⚠️  WARNING: Using LOCAL Supabase URL\n');
  } else {
    console.log('⚠️  WARNING: Using PRODUCTION Supabase URL\n');
  }
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
 * Get transaction logging preference
 */
async function getTransactionLogging(
  rl: ReturnType<typeof createInterface>,
): Promise<boolean> {
  const transactionAnswer = await promptUser(
    rl,
    'Insert adjustment transactions for audit trail? (yes/no) [yes]: ',
  );
  return transactionAnswer === '' || transactionAnswer.toLowerCase() === 'yes';
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
  records: FreeloaderRecord[],
  balances: Map<string, number | null>,
  dryRun: boolean,
  insertTransaction: boolean,
): Promise<ProcessingResult[]> {
  const results: ProcessingResult[] = [];

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const currentBalance = balances.get(record.id) ?? null;

    console.log(
      `[${i + 1}/${records.length}] Processing ${record.username}...`,
    );

    const result = await processUser(
      record,
      currentBalance,
      dryRun,
      insertTransaction,
    );
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
  // Parse CLI arguments
  const options = parseCliArgs();

  // Show help if requested
  if (options.help) {
    displayHelp();
    process.exit(0);
  }

  const rl = createInterface({ input, output });

  try {
    console.log('\n=== Reset Freeloader Credits ===\n');

    // Get CSV file path
    const csvPath = await getCsvPath(rl, options.csvPath);
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
    displayEnvironmentWarning();

    // Batch fetch all credit balances upfront
    const balances = await getAllCreditBalances(records);

    // Get user preferences
    const dryRun = await getDryRunMode(rl, options.dryrun);
    let insertTransaction = false;
    if (!dryRun) {
      insertTransaction = await getTransactionLogging(rl);
    }

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
    const results = await processRecords(
      records,
      balances,
      dryRun,
      insertTransaction,
    );

    // Display summary
    displaySummary(results);

    if (dryRun) {
      console.log(
        '💡 This was a dry run. No changes were made. Run without --dryrun to apply changes.\n',
      );
    } else {
      console.log('✅ All records processed successfully!\n');
    }
  } catch (error) {
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

// Run the script
main();
