import { readFileSync } from 'node:fs';
import { stdin as input, stdout as output } from 'node:process';
import { createInterface } from 'node:readline/promises';

import {
  inputPath,
  loadScriptEnv,
  parseCliArgs,
  runScript,
} from './lib/cli.mts';
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

function parseCsv(filePath: string): DupeRow[] {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n');
  const header = lines[0].split(',');

  const idx = (name: string) => header.indexOf(name);
  const iSourceId = idx('source_id');
  const iUserId = idx('user_id');
  const iEventCount = idx('event_count');
  const iFirstEvent = idx('first_event_at');
  const iLastEvent = idx('last_event_at');
  const iDupCredits = idx('duplicate_credits');

  if ([iSourceId, iUserId, iEventCount, iDupCredits].some((i) => i === -1)) {
    throw new Error(
      'CSV missing required columns: source_id, user_id, event_count, duplicate_credits',
    );
  }

  const rows: DupeRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Split on commas but respect quoted fields
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        fields.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    fields.push(current);

    const duplicateCredits = Number.parseInt(fields[iDupCredits], 10);

    if (Number.isNaN(duplicateCredits) || duplicateCredits <= 0) {
      console.warn(
        `  Row ${i}: skipping — invalid duplicate_credits: ${fields[iDupCredits]}`,
      );
      continue;
    }

    rows.push({
      duplicateCredits,
      eventCount: Number.parseInt(fields[iEventCount], 10),
      firstEventAt: fields[iFirstEvent],
      lastEventAt: fields[iLastEvent],
      sourceId: fields[iSourceId],
      userId: fields[iUserId],
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
  const rows = parseCsv(csvPath);

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
