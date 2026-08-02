#!/usr/bin/env node

/**
 * Fetch the most recently created profiles and check how many of their
 * `username` values (which are actually the user's email) belong to a
 * disposable / temporary email provider.
 *
 * Two independent sources are used so the results can be cross-checked:
 *   1. The `disposable-email-domains-js` npm package (the same one used by
 *      the web app's signup route — apps/web/app/auth/signup/route.ts).
 *   2. The `denyDomains.txt` list from amieiro/disposable-email-domains,
 *      which is cloned (shallow) into scripts/.cache on first run.
 *
 * Usage:
 *   pnpm --filter @sexyvoice/scripts check-disposable-emails [-- --limit 2000]
 *   node check-disposable-emails.mjs --limit 2000
 *   node check-disposable-emails.mjs --days 30
 *
 * Options:
 *   --limit <n>      Number of most-recent profiles to fetch (default: 1000).
 *   --days <n>       Only consider profiles created in the last <n> days
 *                    (applied in addition to --limit).
 *   --out <dir>      Output directory for the summary / CSV (default: cwd).
 *   --no-clone       Skip cloning/updating the amieiro repo (use cached copy).
 *   --reset-credits  Reset the flagged users' credits to 0: zeroes the
 *                    `credits` row and inserts an audit `credit_transactions`
 *                    row for each user that has credits remaining.
 *   --dry-run        With --reset-credits, only report what would change.
 *   --domains-only   In credit-reset logs, print the email domain instead of
 *                    the full address (useful for CI / shared reports).
 *   --yes            Skip the interactive confirmation for a live reset.
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. These are
 * read from apps/web/.env.local (then scripts/.env) automatically.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { stdin as input, stdout as output } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import {
  isDisposableEmail,
  isDisposableEmailDomain,
} from 'disposable-email-domains-js';
import { config as loadEnv } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load env from the web app first, then fall back to scripts/.env.
loadEnv({ path: join(__dirname, '../apps/web/.env.local') });
loadEnv({ path: join(__dirname, '.env') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)) {
  console.error('Missing required environment variables:');
  console.error('  - NEXT_PUBLIC_SUPABASE_URL');
  console.error('  - SUPABASE_SERVICE_ROLE_KEY');
  console.error(
    '\nThey are read from apps/web/.env.local or scripts/.env. Add them and retry.',
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const args = {
    limit: 1000,
    days: null,
    out: process.cwd(),
    clone: true,
    resetCredits: false,
    dryRun: false,
    domainsOnly: false,
    yes: false,
  };
  const rest = [...argv];
  while (rest.length > 0) {
    const arg = rest.shift();
    if (arg === '--limit') {
      args.limit = Number.parseInt(rest.shift(), 10);
    } else if (arg === '--days') {
      args.days = Number.parseInt(rest.shift(), 10);
    } else if (arg === '--out') {
      args.out = rest.shift();
    } else if (arg === '--no-clone') {
      args.clone = false;
    } else if (arg === '--reset-credits') {
      args.resetCredits = true;
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--domains-only') {
      args.domainsOnly = true;
    } else if (arg === '--yes') {
      args.yes = true;
    }
  }
  if (!(Number.isFinite(args.limit) && args.limit > 0)) {
    console.error('--limit must be a positive integer');
    process.exit(1);
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

// ---------------------------------------------------------------------------
// amieiro/disposable-email-domains -> denyDomains.txt
// ---------------------------------------------------------------------------
const AMIEIRO_REPO = 'https://github.com/amieiro/disposable-email-domains';
const CACHE_DIR = join(__dirname, '.cache');
const REPO_DIR = join(CACHE_DIR, 'disposable-email-domains');
const DENY_FILE = join(REPO_DIR, 'denyDomains.txt');

function ensureAmieiroList() {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }

  if (existsSync(join(REPO_DIR, '.git'))) {
    if (args.clone) {
      console.log('Updating cached amieiro/disposable-email-domains...');
      try {
        execFileSync('git', ['-C', REPO_DIR, 'pull', '--ff-only', '--quiet'], {
          stdio: 'inherit',
        });
      } catch {
        console.warn('  Could not update repo; using cached copy.');
      }
    }
  } else if (args.clone) {
    console.log(`Cloning ${AMIEIRO_REPO} (shallow)...`);
    execFileSync(
      'git',
      ['clone', '--depth', '1', '--quiet', AMIEIRO_REPO, REPO_DIR],
      { stdio: 'inherit' },
    );
  } else {
    console.error(
      `--no-clone given but no cached repo at ${REPO_DIR}. Remove --no-clone to clone it.`,
    );
    process.exit(1);
  }

  if (!existsSync(DENY_FILE)) {
    console.error(`denyDomains.txt not found at ${DENY_FILE}`);
    process.exit(1);
  }

  const lines = readFileSync(DENY_FILE, 'utf8').split('\n');
  const set = new Set();
  for (const line of lines) {
    const domain = line.trim().toLowerCase();
    if (domain && !domain.startsWith('#')) {
      set.add(domain);
    }
  }
  return set;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function extractDomain(email) {
  if (typeof email !== 'string') {
    return null;
  }
  const at = email.lastIndexOf('@');
  if (at === -1 || at === email.length - 1) {
    return null;
  }
  return email
    .slice(at + 1)
    .trim()
    .toLowerCase();
}

function pad(n, width) {
  return String(n).padStart(width);
}

function csvEscape(value) {
  const str = String(value ?? '');
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function userLabel(flag, domainsOnly) {
  return domainsOnly ? flag.domain : flag.email;
}

// ---------------------------------------------------------------------------
// Credit reset
// ---------------------------------------------------------------------------
// The `credit_transaction_type` enum (apps/web/lib/supabase/types.d.ts) only
// has 'purchase' | 'freemium' | 'topup' | 'refund' — there is no 'penalty' or
// 'ban' type. Rather than run a schema migration to add one, we reuse 'refund'
// (the same type scripts/reset-freeloader-credits.mts uses for negative
// adjustments) and record the real reason in `description` + `metadata`. If a
// dedicated enum value is added later, change this constant.
const RESET_TX_TYPE = 'refund';
const CREDIT_CHUNK = 1000; // Supabase `.in()` cap.
// Transaction types that mark a user as having paid — never reset these users.
const PAID_TX_TYPES = ['purchase', 'topup'];

/** Return the subset of user IDs that have a purchase or topup transaction. */
async function fetchPaidUserIds(supabase, ids) {
  const paid = new Set();
  for (let i = 0; i < ids.length; i += CREDIT_CHUNK) {
    const chunk = ids.slice(i, i + CREDIT_CHUNK);
    const { data, error } = await supabase
      .from('credit_transactions')
      .select('user_id')
      .in('user_id', chunk)
      .in('type', PAID_TX_TYPES);
    if (error) {
      throw new Error(`Failed to fetch paid transactions: ${error.message}`);
    }
    for (const row of data) {
      paid.add(row.user_id);
    }
  }
  return paid;
}

/**
 * Reset the flagged users' credits to 0 and log an audit transaction for each
 * user that still has a positive balance. Paid users (any purchase/topup
 * transaction) and users already at 0 are skipped.
 */
async function resetFlaggedCredits(supabase, flagged, dryRun, domainsOnly) {
  const byId = new Map(flagged.map((f) => [f.id, f]));
  const ids = [...byId.keys()];

  // Never reset users who have ever paid.
  const paidIds = await fetchPaidUserIds(supabase, ids);
  if (paidIds.size > 0) {
    console.log(
      `  Protecting ${paidIds.size} paid user(s) (have a purchase/topup) — they will be skipped.`,
    );
  }

  // Fetch current balances in chunks.
  const balances = new Map(); // user_id -> amount
  for (let i = 0; i < ids.length; i += CREDIT_CHUNK) {
    const chunk = ids.slice(i, i + CREDIT_CHUNK);
    const { data, error } = await supabase
      .from('credits')
      .select('user_id, amount')
      .in('user_id', chunk);
    if (error) {
      throw new Error(`Failed to fetch credit balances: ${error.message}`);
    }
    for (const row of data) {
      balances.set(row.user_id, row.amount ?? 0);
    }
  }

  const result = {
    reset: 0,
    skipped: 0,
    paid: 0,
    failed: 0,
    creditsRemoved: 0,
  };
  const ts = new Date().toISOString();

  for (const id of ids) {
    const flag = byId.get(id);
    const current = balances.get(id);

    const label = userLabel(flag, domainsOnly);

    if (paidIds.has(id)) {
      console.log(`  💳 ${label}: paid user, skipping`);
      result.paid++;
      continue;
    }
    if (current === undefined) {
      console.log(`  ⏭️  ${label}: no credits row, skipping`);
      result.skipped++;
      continue;
    }
    if (current <= 0) {
      result.skipped++;
      continue;
    }

    if (dryRun) {
      console.log(`  [DRY RUN] ${label}: ${current} → 0`);
      result.reset++;
      result.creditsRemoved += current;
      continue;
    }

    const ok = await zeroUserCredits(supabase, flag, current, ts);
    if (ok) {
      console.log(`  ✅ ${label}: ${current} → 0`);
      result.reset++;
      result.creditsRemoved += current;
    } else {
      result.failed++;
    }
  }

  return result;
}

/**
 * Zero a single user's `credits` balance and insert the audit transaction.
 * Logs and returns false on failure.
 */
async function zeroUserCredits(supabase, flag, current, ts) {
  const { error: updateError } = await supabase
    .from('credits')
    .update({ amount: 0, updated_at: ts })
    .eq('user_id', flag.id);
  if (updateError) {
    console.log(`  ❌ ${flag.email}: ${updateError.message}`);
    return false;
  }

  // Audit trail: record the removal as a negative transaction.
  const source = flag.by_amieiro ? 'amieiro denyDomains' : 'npm package';
  const { error: txError } = await supabase.from('credit_transactions').insert({
    user_id: flag.id,
    amount: -Math.abs(current),
    type: RESET_TX_TYPE,
    description: `Credits reset to 0 — disposable email signup (${flag.domain})`,
    metadata: {
      automated: true,
      script: 'check-disposable-emails.mjs',
      reason: 'disposable_email',
      domain: flag.domain,
      detected_by: source,
      previous_amount: current,
      timestamp: ts,
    },
  });
  if (txError) {
    // Balance was already zeroed; surface the audit failure loudly.
    console.log(
      `  ⚠️  ${flag.email}: credits zeroed but transaction insert failed: ${txError.message}`,
    );
    return false;
  }

  return true;
}

async function confirmLiveReset(count) {
  const isLocal =
    SUPABASE_URL.includes('127.0.0.1') || SUPABASE_URL.includes('localhost');
  console.log(
    `\n⚠️  About to reset credits to 0 for up to ${count} flagged users on the ${isLocal ? 'LOCAL' : 'PRODUCTION'} database.`,
  );
  const rl = createInterface({ input, output });
  try {
    const answer = await rl.question('Type "RESET CREDITS" to confirm: ');
    return answer.trim() === 'RESET CREDITS';
  } finally {
    rl.close();
  }
}

/**
 * Drive the optional credit reset: print guidance, confirm, run, and report.
 */
async function handleCreditReset(supabase, flagged) {
  if (!args.resetCredits) {
    if (flagged.length > 0) {
      console.log(
        '\nTip: re-run with --reset-credits --dry-run to preview zeroing these users’ credits.',
      );
    }
    return;
  }

  if (flagged.length === 0) {
    console.log('\nNo flagged users to reset.');
    return;
  }

  console.log(
    `\n${args.dryRun ? '[DRY RUN] ' : ''}Resetting credits for ${flagged.length} flagged users...`,
  );

  if (!(args.dryRun || args.yes)) {
    const confirmed = await confirmLiveReset(flagged.length);
    if (!confirmed) {
      console.log('Aborted. No credits were changed.');
      return;
    }
  }

  const reset = await resetFlaggedCredits(
    supabase,
    flagged,
    args.dryRun,
    args.domainsOnly,
  );

  console.log('\n=== Credit reset summary ===');
  console.log(`  Users reset:       ${reset.reset}`);
  console.log(`  Skipped (paid):    ${reset.paid}`);
  console.log(`  Skipped (≤0):     ${reset.skipped}`);
  console.log(`  Failed:            ${reset.failed}`);
  console.log(`  Credits removed:   ${reset.creditsRemoved}`);
  if (args.dryRun) {
    console.log(
      '\n💡 Dry run — no changes were made. Re-run without --dry-run to apply.',
    );
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
// Supabase caps each request at ~1000 rows, so page through with .range().
const PAGE_SIZE = 1000;

/** Fetch the most-recent profiles, paging past Supabase's per-request cap. */
async function fetchRecentProfiles(supabase) {
  let sinceISO = null;
  if (args.days) {
    const since = new Date();
    since.setDate(since.getDate() - args.days);
    sinceISO = since.toISOString();
    console.log(
      `Fetching up to ${args.limit} profiles created in the last ${args.days} days...`,
    );
  } else {
    console.log(`Fetching the last ${args.limit} created profiles...`);
  }

  const profiles = [];
  for (let offset = 0; offset < args.limit; offset += PAGE_SIZE) {
    const end = Math.min(offset + PAGE_SIZE, args.limit) - 1;
    let query = supabase
      .from('profiles')
      .select('id, username, created_at')
      .order('created_at', { ascending: false })
      .range(offset, end);
    if (sinceISO) {
      query = query.gte('created_at', sinceISO);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching profiles:', error);
      process.exit(1);
    }
    profiles.push(...data);
    if (data.length < end - offset + 1) {
      break; // No more rows.
    }
  }

  console.log(`Fetched ${profiles.length} profiles\n`);
  return profiles;
}

/** Classify each profile's email against both disposable sources. */
function classifyProfiles(profiles, denySet) {
  const flagged = [];
  const stats = { withEmail: 0, pkg: 0, amieiro: 0, either: 0, both: 0 };
  const domainCounts = new Map(); // disposable domain -> count

  for (const profile of profiles) {
    const email = profile.username;
    const domain = extractDomain(email);
    stats.withEmail++;

    const byPkg = isDisposableEmail(email) || isDisposableEmailDomain(domain);
    const byAmieiro = denySet.has(domain);
    if (!(byPkg || byAmieiro)) {
      continue;
    }

    if (byPkg) {
      stats.pkg++;
    }
    if (byAmieiro) {
      stats.amieiro++;
    }
    stats.either++;
    if (byPkg && byAmieiro) {
      stats.both++;
    }

    domainCounts.set(domain, (domainCounts.get(domain) ?? 0) + 1);
    flagged.push({
      id: profile.id,
      email,
      domain,
      created_at: profile.created_at,
      by_package: byPkg,
      by_amieiro: byAmieiro,
    });
  }

  return { flagged, stats, domainCounts };
}

async function main() {
  const denySet = ensureAmieiroList();
  console.log(`amieiro denyDomains.txt: ${denySet.size} domains loaded\n`);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const profiles = await fetchRecentProfiles(supabase);
  const { flagged, stats, domainCounts } = classifyProfiles(profiles, denySet);

  const {
    withEmail,
    pkg: disposablePkg,
    amieiro: disposableAmieiro,
    either: disposableEither,
    both: disposableBoth,
  } = stats;
  const total = profiles.length;
  const pct = (n) =>
    withEmail ? `${((n / withEmail) * 100).toFixed(2)}%` : 'n/a';

  // Sorted disposable-domain breakdown (most common first).
  const topDomains = [...domainCounts.entries()].sort((a, b) => b[1] - a[1]);

  // ---------------------------------------------------------------------
  // Build the summary text
  // ---------------------------------------------------------------------
  const now = new Date();
  const lines = [];
  lines.push('Disposable email check — summary');
  lines.push('='.repeat(60));
  lines.push(`Generated:            ${now.toISOString()}`);
  lines.push(
    `Scope:                last ${args.limit} profiles${args.days ? ` (created in last ${args.days} days)` : ''}`,
  );
  lines.push(`Profiles fetched:     ${total}`);
  lines.push('');
  lines.push('Disposable detection (% of profiles with a valid email):');
  lines.push(
    `  by npm package:           ${pad(disposablePkg, 6)}  (${pct(disposablePkg)})`,
  );
  lines.push(
    `  by amieiro denyDomains:   ${pad(disposableAmieiro, 6)}  (${pct(disposableAmieiro)})`,
  );
  lines.push(
    `  by either source:         ${pad(disposableEither, 6)}  (${pct(disposableEither)})`,
  );
  lines.push(
    `  by both sources:          ${pad(disposableBoth, 6)}  (${pct(disposableBoth)})`,
  );
  lines.push(
    `  package-only (not amieiro): ${pad(disposableEither - disposableAmieiro, 4)}`,
  );
  lines.push(
    `  amieiro-only (not package): ${pad(disposableEither - disposablePkg, 4)}`,
  );
  lines.push('');
  lines.push(`Distinct disposable domains: ${topDomains.length}`);
  lines.push('Top disposable domains:');
  for (const [domain, count] of topDomains.slice(0, 30)) {
    lines.push(`  ${pad(count, 5)}  ${domain}`);
  }
  lines.push('');
  lines.push('Sources:');
  lines.push('  1. npm: disposable-email-domains-js');
  lines.push(`  2. ${AMIEIRO_REPO} (denyDomains.txt)`);
  lines.push('');

  const summary = lines.join('\n');

  // ---------------------------------------------------------------------
  // Write output files
  // ---------------------------------------------------------------------
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const summaryPath = join(args.out, `disposable-emails-summary-${stamp}.txt`);
  const csvPath = join(args.out, `disposable-emails-${stamp}.csv`);

  writeFileSync(summaryPath, summary, 'utf8');

  const csvHeader = 'id,email,domain,created_at,by_package,by_amieiro';
  const csvRows = flagged.map((r) =>
    [
      csvEscape(r.id),
      csvEscape(r.email),
      csvEscape(r.domain),
      csvEscape(r.created_at),
      r.by_package,
      r.by_amieiro,
    ].join(','),
  );
  writeFileSync(csvPath, [csvHeader, ...csvRows].join('\n'), 'utf8');

  // ---------------------------------------------------------------------
  // Console output
  // ---------------------------------------------------------------------
  console.log(summary);
  console.log(`Summary written to: ${summaryPath}`);
  console.log(`Flagged emails CSV: ${csvPath} (${flagged.length} rows)`);

  await handleCreditReset(supabase, flagged);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
