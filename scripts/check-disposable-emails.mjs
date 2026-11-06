#!/usr/bin/env node

/**
 * Check how many recent signups use a disposable email domain, and optionally
 * reset those users' credits. See HELP for the options.
 *
 * Two independent sources are used so the results can be cross-checked:
 *   1. The `disposable-email-domains-js` npm package (the same one used by
 *      the web app's signup route — apps/web/app/auth/signup/route.ts).
 *   2. The `denyDomains.txt` list from amieiro/disposable-email-domains,
 *      which is cloned (shallow) into scripts/.cache on first run.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { stdin as input, stdout as output } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import {
  isDisposableEmail,
  isDisposableEmailDomain,
} from 'disposable-email-domains-js';

import {
  inputPath,
  isLocalUrl,
  loadScriptEnv,
  parseCliArgs,
  runScript,
} from './lib/cli.mts';
import { toCsv } from './lib/csv.mts';
import { adjustCredits, readBalances, readPaidUserIds } from './lib/ledger.mts';
import { createScriptAdminClient } from './lib/supabase.mts';

const __dirname = dirname(fileURLToPath(import.meta.url));

const HELP = `Count recent signups whose email domain is disposable, and optionally
reset their credits to 0. Paid users are never reset.

Usage: pnpm check-disposable-emails [options]

  --limit <n>      Most recent profiles to check (default: 10000)
  --days <n>       Only profiles created in the last <n> days, within --limit
  --out <dir>      Directory for the summary and CSV (default: working directory)
  --no-clone       Use the cached amieiro list without cloning or updating it
  --reset-credits  Reset the flagged users' credits to 0, with a ledger row each
  --dry-run        With --reset-credits, report what would change
  --domains-only   Print email domains instead of addresses in reset logs
  --yes            Skip the typed confirmation for a live reset
  -h, --help       Show this help`;

function readOptions() {
  const { values } = parseCliArgs({
    options: {
      days: { type: 'string' },
      'domains-only': { default: false, type: 'boolean' },
      'dry-run': { default: false, type: 'boolean' },
      help: { default: false, short: 'h', type: 'boolean' },
      limit: { default: '10000', type: 'string' },
      'no-clone': { default: false, type: 'boolean' },
      out: { type: 'string' },
      'reset-credits': { default: false, type: 'boolean' },
      yes: { default: false, type: 'boolean' },
    },
  });
  const options = {
    clone: !values['no-clone'],
    days: values.days === undefined ? null : Number(values.days),
    domainsOnly: values['domains-only'],
    dryRun: values['dry-run'],
    help: values.help,
    limit: Number(values.limit),
    out: values.out ? inputPath(values.out) : process.cwd(),
    resetCredits: values['reset-credits'],
    yes: values.yes,
  };
  if (!(Number.isSafeInteger(options.limit) && options.limit > 0)) {
    throw new Error('--limit must be a positive integer');
  }
  if (
    options.days !== null &&
    !(Number.isSafeInteger(options.days) && options.days > 0)
  ) {
    throw new Error('--days must be a positive integer');
  }
  return options;
}

let args;

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
    throw new Error(
      `--no-clone given but no cached repo at ${REPO_DIR}. Remove --no-clone to clone it.`,
    );
  }

  if (!existsSync(DENY_FILE)) {
    throw new Error(`denyDomains.txt not found at ${DENY_FILE}`);
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

function userLabel(flag, domainsOnly) {
  return domainsOnly ? flag.domain : flag.email;
}

// ---------------------------------------------------------------------------
// Credit reset
// ---------------------------------------------------------------------------

/**
 * Reset the flagged users' credits to 0, each with a ledger row. Paid users
 * (any purchase or top-up) and users at 0 or below are skipped.
 */
async function resetFlaggedCredits(supabase, flagged, dryRun, domainsOnly) {
  const byId = new Map(flagged.map((f) => [f.id, f]));
  const ids = [...byId.keys()];

  const [paidIds, balances] = await Promise.all([
    readPaidUserIds(supabase, ids),
    readBalances(supabase, ids),
  ]);
  if (paidIds.size > 0) {
    console.log(
      `  Protecting ${paidIds.size} paid user(s) (have a purchase/topup) — they will be skipped.`,
    );
  }

  const result = {
    creditsRemoved: 0,
    failed: 0,
    paid: 0,
    reset: 0,
    skipped: 0,
  };
  const ts = new Date().toISOString();

  for (const id of ids) {
    const flag = byId.get(id);
    const current = balances.get(id)?.amount;

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

    try {
      await adjustCredits(supabase, {
        amount: -current,
        description: `Credits reset to 0 — disposable email signup (${flag.domain})`,
        metadata: {
          automated: true,
          detected_by: flag.by_amieiro ? 'amieiro denyDomains' : 'npm package',
          domain: flag.domain,
          previous_amount: current,
          script: 'check-disposable-emails.mjs',
          timestamp: ts,
        },
        reason: 'disposable_email',
        userId: id,
      });
      console.log(`  ✅ ${label}: ${current} → 0`);
      result.reset++;
      result.creditsRemoved += current;
    } catch (error) {
      console.log(`  ❌ ${label}: ${error.message}`);
      result.failed++;
    }
  }

  return result;
}

async function confirmLiveReset(count) {
  const isLocal = isLocalUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
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
  if (reset.failed > 0) {
    process.exitCode = 1;
  }
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
      throw new Error(`Failed to fetch profiles: ${error.message}`);
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
  const stats = { amieiro: 0, both: 0, either: 0, pkg: 0, withEmail: 0 };
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
      by_amieiro: byAmieiro,
      by_package: byPkg,
      created_at: profile.created_at,
      domain,
      email,
      id: profile.id,
    });
  }

  return { domainCounts, flagged, stats };
}

async function main() {
  args = readOptions();
  if (args.help) {
    console.log(HELP);
    return;
  }

  const denySet = ensureAmieiroList();
  console.log(`amieiro denyDomains.txt: ${denySet.size} domains loaded\n`);

  loadScriptEnv();
  // A dry run or a plain check only reads; a live reset also writes.
  const supabase = createScriptAdminClient({
    readOnly: !args.resetCredits || args.dryRun,
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

  writeFileSync(
    csvPath,
    toCsv(
      ['id', 'email', 'domain', 'created_at', 'by_package', 'by_amieiro'],
      flagged.map((r) => [
        r.id,
        r.email,
        r.domain,
        r.created_at,
        r.by_package,
        r.by_amieiro,
      ]),
    ),
    'utf8',
  );

  // ---------------------------------------------------------------------
  // Console output
  // ---------------------------------------------------------------------
  console.log(summary);
  console.log(`Summary written to: ${summaryPath}`);
  console.log(`Flagged emails CSV: ${csvPath} (${flagged.length} rows)`);

  await handleCreditReset(supabase, flagged);
}

runScript(import.meta.url, main);
