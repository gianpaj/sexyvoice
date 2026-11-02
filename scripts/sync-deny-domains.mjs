#!/usr/bin/env node

/**
 * Generate the bundled amieiro disposable-domain list used by the web app's
 * signup route (apps/web/lib/disposable-email).
 *
 * Clones (or updates) amieiro/disposable-email-domains into scripts/.cache,
 * normalizes its denyDomains list (trim, lowercase, dedupe, sort) and writes it
 * as a minified JSON array of strings that the web app imports directly.
 *
 * The generated file is added to .biomeignore so the formatter leaves it
 * minified. TypeScript widens a homogeneous JSON array to `string[]`, so the
 * import stays cheap to type-check.
 *
 * Run: pnpm --filter @sexyvoice/scripts sync-deny-domains
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const AMIEIRO_REPO = 'https://github.com/amieiro/disposable-email-domains';
const CACHE_DIR = join(__dirname, '.cache');
const REPO_DIR = join(CACHE_DIR, 'disposable-email-domains');
const DENY_FILE = join(REPO_DIR, 'denyDomains.txt');
const OUT_FILE = join(
  __dirname,
  '../apps/web/lib/disposable-email/deny-domains.json',
);

function ensureRepo() {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }
  if (existsSync(join(REPO_DIR, '.git'))) {
    console.log('Updating cached amieiro/disposable-email-domains...');
    execFileSync('git', ['-C', REPO_DIR, 'pull', '--ff-only', '--quiet'], {
      stdio: 'inherit',
    });
  } else {
    console.log(`Cloning ${AMIEIRO_REPO} (shallow)...`);
    execFileSync(
      'git',
      ['clone', '--depth', '1', '--quiet', AMIEIRO_REPO, REPO_DIR],
      { stdio: 'inherit' },
    );
  }
  if (!existsSync(DENY_FILE)) {
    console.error(`denyDomains.txt not found at ${DENY_FILE}`);
    process.exit(1);
  }
}

function loadDomains() {
  const seen = new Set();
  for (const line of readFileSync(DENY_FILE, 'utf8').split('\n')) {
    const domain = line.trim().toLowerCase();
    if (domain && !domain.startsWith('#')) {
      seen.add(domain);
    }
  }
  return [...seen].sort();
}

function main() {
  ensureRepo();
  const domains = loadDomains();
  console.log(`Loaded ${domains.length} unique domains`);

  // Minified JSON array — kept out of the formatter via .biomeignore.
  writeFileSync(OUT_FILE, JSON.stringify(domains), 'utf8');
  console.log(`Wrote ${domains.length} domains to ${OUT_FILE}`);
}

main();
