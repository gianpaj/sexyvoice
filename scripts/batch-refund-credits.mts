import { readFileSync } from 'node:fs';
import { stdin as input, stdout as output } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: ['.env', '.env.local'] });

interface DupeRow {
  sourceId: string;
  userId: string;
  eventCount: number;
  firstEventAt: string;
  lastEventAt: string;
  duplicateCredits: number;
}

interface RefundResult {
  sourceId: string;
  userId: string;
  credits: number;
  status: 'ok' | 'skipped' | 'error';
  reason?: string;
}

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
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
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
      console.warn(`  Row ${i}: skipping — invalid duplicate_credits: ${fields[iDupCredits]}`);
      continue;
    }

    rows.push({
      sourceId: fields[iSourceId],
      userId: fields[iUserId],
      eventCount: Number.parseInt(fields[iEventCount], 10),
      firstEventAt: fields[iFirstEvent],
      lastEventAt: fields[iLastEvent],
      duplicateCredits,
    });
  }

  return rows;
}

async function applyPlatformBugRefund(
  userId: string,
  refundCredits: number,
  sourceId: string,
): Promise<void> {
  const supabase = createAdminClient();

  const description = `Refund - Double billing (voice call ${sourceId.substring(0, 8)})`;

  const { error: txError } = await supabase.from('credit_transactions').insert({
    user_id: userId,
    amount: refundCredits,
    type: 'refund',
    description,
    reference_id: null,
    metadata: { reason: 'Double billing - voice call', sourceId },
  });

  if (txError) {
    throw new Error(`insert credit_transactions: ${txError.message}`);
  }

  const { error: creditsError } = await supabase.rpc('increment_user_credits', {
    user_id_var: userId,
    credit_amount_var: refundCredits,
  });

  if (creditsError) {
    throw new Error(`increment_user_credits: ${creditsError.message}`);
  }
}

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error('Usage: tsx batch-refund-credits.mts <path-to-dupes.csv>');
    process.exit(1);
  }

  const isDryRun = process.argv.includes('--dry-run');

  console.log(`Parsing CSV: ${csvPath}`);
  const rows = parseCsv(csvPath);

  if (rows.length === 0) {
    console.log('No valid rows to process.');
    process.exit(0);
  }

  const totalCredits = rows.reduce((s, r) => s + r.duplicateCredits, 0);

  console.log('\n=== Batch Refund Summary ===');
  console.log(`Rows to process : ${rows.length}`);
  console.log(`Total credits   : ${totalCredits.toLocaleString()}`);
  console.log(`Supabase URL    : ${process.env.NEXT_PUBLIC_SUPABASE_URL}`);
  if (isDryRun) console.log('\n[DRY RUN — no changes will be made]');
  console.log('');

  const rl = createInterface({ input, output });

  const confirm = (await rl.question('Proceed? (yes/no): ')).trim().toLowerCase();
  rl.close();

  if (confirm !== 'yes') {
    console.log('Cancelled.');
    process.exit(0);
  }

  const results: RefundResult[] = [];
  let okCount = 0;
  let errCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const prefix = `[${i + 1}/${rows.length}]`;
    process.stdout.write(
      `${prefix} user=${row.userId.substring(0, 8)} credits=${row.duplicateCredits} ... `,
    );

    if (isDryRun) {
      console.log('(dry run)');
      results.push({ sourceId: row.sourceId, userId: row.userId, credits: row.duplicateCredits, status: 'skipped', reason: 'dry run' });
      continue;
    }

    try {
      await applyPlatformBugRefund(row.userId, row.duplicateCredits, row.sourceId);
      console.log('OK');
      okCount++;
      results.push({ sourceId: row.sourceId, userId: row.userId, credits: row.duplicateCredits, status: 'ok' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`ERROR: ${msg}`);
      errCount++;
      results.push({ sourceId: row.sourceId, userId: row.userId, credits: row.duplicateCredits, status: 'error', reason: msg });
    }
  }

  console.log('\n=== Done ===');
  console.log(`OK     : ${okCount}`);
  console.log(`Errors : ${errCount}`);

  if (errCount > 0) {
    console.log('\nFailed rows:');
    for (const r of results.filter((r) => r.status === 'error')) {
      console.log(`  source=${r.sourceId} user=${r.userId} credits=${r.credits} — ${r.reason}`);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\nFatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
