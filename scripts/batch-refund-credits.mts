import { readFileSync } from 'node:fs';
import { stdin as input, stdout as output } from 'node:process';
import { createInterface } from 'node:readline/promises';

import {
  inputPath,
  loadScriptEnv,
  parseCliArgs,
  runScript,
} from './lib/cli.mts';
import { parseCsv } from './lib/csv.mts';
import { adjustCredits } from './lib/ledger.mts';
import {
  createScriptAdminClient,
  type ScriptSupabaseClient,
} from './lib/supabase.mts';

const HELP = `Add credits back for double-billed voice calls, one CSV row at a time.

Usage: pnpm batch-refund-credits <dupes.csv> [--dry-run]

The CSV needs source_id, user_id, event_count and duplicate_credits columns;
rows whose duplicate_credits is not a positive integer are skipped. A call
that already has its refund row is skipped, so a rerun refunds nothing twice.

  --dry-run   List the refunds without changing the database
  -h, --help  Show this help`;

interface DupeRow {
  duplicateCredits: number;
  eventCount: number;
  firstEventAt: string;
  lastEventAt: string;
  sourceId: string;
  userId: string;
}

interface RefundResult {
  credits: number;
  reason?: string;
  sourceId: string;
  status: 'duplicate' | 'error' | 'ok' | 'skipped';
  userId: string;
}

const REQUIRED_COLUMNS = [
  'source_id',
  'user_id',
  'event_count',
  'duplicate_credits',
] as const;

function readDupes(filePath: string): DupeRow[] {
  const { columns, rows: records } = parseCsv(readFileSync(filePath, 'utf8'));
  if (REQUIRED_COLUMNS.some((column) => !columns.includes(column))) {
    throw new Error(
      `CSV missing required columns: ${REQUIRED_COLUMNS.join(', ')}`,
    );
  }

  const rows: DupeRow[] = [];
  for (const [index, record] of records.entries()) {
    const duplicateCredits = Number.parseInt(record.duplicate_credits, 10);
    if (Number.isNaN(duplicateCredits) || duplicateCredits <= 0) {
      console.warn(
        `  Row ${index + 1}: skipping — invalid duplicate_credits: ${record.duplicate_credits}`,
      );
      continue;
    }

    rows.push({
      duplicateCredits,
      eventCount: Number.parseInt(record.event_count, 10),
      firstEventAt: record.first_event_at ?? '',
      lastEventAt: record.last_event_at ?? '',
      sourceId: record.source_id,
      userId: record.user_id,
    });
  }

  return rows;
}

async function applyPlatformBugRefund(
  supabase: ScriptSupabaseClient,
  userId: string,
  refundCredits: number,
  sourceId: string,
): Promise<'applied' | 'duplicate'> {
  const { status } = await adjustCredits(supabase, {
    amount: refundCredits,
    description: `Refund - Double billing (voice call ${sourceId.slice(0, 8)})`,
    idempotencyKey: `double-billing:${sourceId}`,
    metadata: { sourceId },
    reason: 'Double billing - voice call',
    userId,
  });
  return status;
}

async function main() {
  const { positionals, values } = parseCliArgs({
    allowPositionals: true,
    options: {
      'dry-run': { default: false, type: 'boolean' },
      help: { default: false, short: 'h', type: 'boolean' },
    },
  });
  if (values.help) {
    console.log(HELP);
    return;
  }
  const [csvArgument, ...extra] = positionals;
  if (!csvArgument || extra.length > 0) {
    throw new Error(`Expected one CSV path.\n\n${HELP}`);
  }

  const isDryRun = values['dry-run'];
  const csvPath = inputPath(csvArgument);

  console.log(`Parsing CSV: ${csvPath}`);
  const rows = readDupes(csvPath);

  if (rows.length === 0) {
    console.log('No valid rows to process.');
    return;
  }

  const totalCredits = rows.reduce((s, r) => s + r.duplicateCredits, 0);

  console.log('\n=== Batch Refund Summary ===');
  console.log(`Rows to process : ${rows.length}`);
  console.log(`Total credits   : ${totalCredits.toLocaleString()}`);
  if (isDryRun) console.log('\n[DRY RUN — no changes will be made]');
  console.log('');

  let supabase: ScriptSupabaseClient | undefined;
  if (!isDryRun) {
    loadScriptEnv();
    supabase = createScriptAdminClient();
    const rl = createInterface({ input, output });
    const confirm = (await rl.question('Proceed? (yes/no): '))
      .trim()
      .toLowerCase();
    rl.close();

    if (confirm !== 'yes') {
      console.log('Cancelled.');
      return;
    }
  }

  const results: RefundResult[] = [];
  let okCount = 0;
  let errCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const prefix = `[${i + 1}/${rows.length}]`;
    process.stdout.write(
      `${prefix} user=${row.userId.slice(0, 8)} credits=${row.duplicateCredits} ... `,
    );

    if (!supabase) {
      console.log('(dry run)');
      results.push({
        credits: row.duplicateCredits,
        reason: 'dry run',
        sourceId: row.sourceId,
        status: 'skipped',
        userId: row.userId,
      });
      continue;
    }

    try {
      const status = await applyPlatformBugRefund(
        supabase,
        row.userId,
        row.duplicateCredits,
        row.sourceId,
      );
      if (status === 'duplicate') {
        console.log('already refunded');
        results.push({
          credits: row.duplicateCredits,
          sourceId: row.sourceId,
          status: 'duplicate',
          userId: row.userId,
        });
        continue;
      }
      console.log('OK');
      okCount++;
      results.push({
        credits: row.duplicateCredits,
        sourceId: row.sourceId,
        status: 'ok',
        userId: row.userId,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`ERROR: ${msg}`);
      errCount++;
      results.push({
        credits: row.duplicateCredits,
        reason: msg,
        sourceId: row.sourceId,
        status: 'error',
        userId: row.userId,
      });
    }
  }

  console.log('\n=== Done ===');
  console.log(`OK     : ${okCount}`);
  console.log(
    `Skipped: ${results.filter((r) => r.status === 'duplicate').length} already refunded`,
  );
  console.log(`Errors : ${errCount}`);

  if (errCount > 0) {
    console.log('\nFailed rows:');
    for (const r of results.filter((r) => r.status === 'error')) {
      console.log(
        `  source=${r.sourceId} user=${r.userId} credits=${r.credits} — ${r.reason}`,
      );
    }
    process.exitCode = 1;
  }
}

runScript(import.meta.url, main);
