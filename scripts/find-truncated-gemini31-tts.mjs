#!/usr/bin/env node

/**
 * Find `gemini-3.1-flash-tts-preview` audio_files whose audio duration does not
 * match a normally generated file — i.e. the model truncated the audio and only
 * rendered a few seconds of a much longer transcript, yet the user was still
 * billed for the full input text.
 *
 * Why this happens
 * ----------------
 * Credits for Gemini TTS are `ceil(totalTokenCount * 1.1 * multiplier)` where
 * `totalTokenCount = promptTokenCount + candidatesTokenCount`
 * (see apps/web/lib/utils.ts:calculateCreditsFromTokens). A long transcript that
 * the model fails to fully voice still produces a large `promptTokenCount`, so
 * the user pays for the whole script but only receives a few seconds of audio.
 *
 * Detection signal
 * ----------------
 * The transcript stored in `text_content` (everything after the `## TRANSCRIPT`
 * marker, see apps/web/lib/tts/gemini-prompt.ts) is the text that *should* have
 * been spoken. Dividing its character count by the audio `duration` gives
 * chars-per-second. Natural speech tops out around ~25 cps, so any file whose
 * spoken text would need far more seconds than the audio actually lasts was
 * truncated. Example rows from the reported user:
 *   - bad : ~2400 spoken chars /  7.08s  ≈ 340 cps  -> truncated
 *   - good: ~1050 spoken chars / 70.24s  ≈  15 cps  -> normal
 *
 * Usage
 * -----
 *   node --env-file=.env scripts/find-truncated-gemini31-tts.mjs [options]
 *   # or, if you keep creds in .env / .env.local, dotenv is loaded automatically:
 *   node scripts/find-truncated-gemini31-tts.mjs [options]
 *
 * Options
 *   --user <uuid>       Only scan this user_id (default: all users).
 *   --threshold <cps>   Flag when spoken chars-per-second exceeds this
 *                       (default: 30 — comfortably above natural speech).
 *   --min-chars <n>     Ignore clips whose transcript is shorter than this, to
 *                       avoid noise on tiny generations (default: 150).
 *   --normal-cps <cps>  Assumed natural rate used to compute the "expected"
 *                       duration and the delivered fraction (default: 15).
 *   --active-only       Skip soft-deleted rows (deleted_at not null).
 *   --since <date>      Only scan files created on/after this date/timestamp,
 *                       ISO-parseable (e.g. 2026-06-01 or 2026-06-01T00:00:00Z).
 *   --paid-only         Only scan users who have paid (a purchase/topup credit
 *                       transaction). Freemium-only users can't be refunded.
 *   --out <path>        JSON report path (default: ./truncated-gemini31-tts.json).
 *   --reason <text>     Refund reason printed in the generated refund commands.
 *
 * The report ends with ready-to-run `refund-credits.mts` commands — one per
 * affected user — that issue a credits-only ("platform bug") refund with a
 * reason. `refund-credits.mts` takes the user id on the CLI and asks for the
 * credit amount + reason interactively, so each command is annotated with the
 * exact values to enter at its prompts.
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (read-only use).
 */

import { writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

// Load .env / .env.local when present (no-op if --env-file already populated env).
config({ path: ['.env', '.env.local'] });

const MODEL = 'gemini-3.1-flash-tts-preview';
const TRANSCRIPT_MARKER = /##\s*TRANSCRIPT\s*\r?\n/;
// audio_files.duration sentinel meaning "duration could not be measured".
const UNKNOWN_DURATION = -1;
const PAGE_SIZE = 1000;

function parseArgs(argv) {
  const opts = {
    user: null,
    threshold: 30,
    minChars: 150,
    normalCps: 15,
    activeOnly: false,
    since: null,
    paidOnly: false,
    out: './truncated-gemini31-tts.json',
    reason:
      'Truncated Gemini 3.1 Flash TTS: billed for the full transcript but only a few seconds of audio were generated',
  };
  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    const next = () => argv[++i];
    switch (arg) {
      case '--user':
        opts.user = next();
        break;
      case '--threshold':
        opts.threshold = Number(next());
        break;
      case '--min-chars':
        opts.minChars = Number(next());
        break;
      case '--normal-cps':
        opts.normalCps = Number(next());
        break;
      case '--active-only':
        opts.activeOnly = true;
        break;
      case '--since':
        opts.since = next();
        break;
      case '--paid-only':
        opts.paidOnly = true;
        break;
      case '--out':
        opts.out = next();
        break;
      case '--reason':
        opts.reason = next();
        break;
      case '--help':
      case '-h':
        console.log(
          'See the header of this file for options. Common: --user <uuid> --threshold <cps>',
        );
        process.exit(0);
        break;
      default:
        console.warn(`Ignoring unknown argument: ${arg}`);
    }
    i++;
  }
  return opts;
}

function createSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!(url && key)) {
    console.error('Missing required environment variables:');
    console.error('  - NEXT_PUBLIC_SUPABASE_URL');
    console.error('  - SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Extract the text that should have been spoken from the stored prompt. */
function extractSpokenText(textContent) {
  if (!textContent) return '';
  const match = textContent.match(TRANSCRIPT_MARKER);
  // No director-notes wrapper -> the whole stored text is the transcript.
  const spoken = match
    ? textContent.slice(match.index + match[0].length)
    : textContent;
  return spoken.trim();
}

/** `usage` is jsonb (object) via supabase-js, but tolerate a JSON string too. */
function parseUsage(usage) {
  if (!usage) return {};
  if (typeof usage === 'string') {
    try {
      return JSON.parse(usage);
    } catch {
      return {};
    }
  }
  return usage;
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Validate --since and normalize it to an ISO string for the query. */
function normalizeSince(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    console.error(
      `Invalid --since date: "${value}". Use an ISO date/timestamp, e.g. 2026-06-01.`,
    );
    process.exit(1);
  }
  return date.toISOString();
}

async function fetchAllRows(supabase, opts) {
  const rows = [];
  let from = 0;
  for (;;) {
    let query = supabase
      .from('audio_files')
      .select(
        'id, user_id, voice_id, storage_key, duration, text_content, credits_used, created_at, usage, model, status, deleted_at',
      )
      .eq('model', MODEL)
      .order('created_at', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (opts.user) query = query.eq('user_id', opts.user);
    if (opts.activeOnly) query = query.is('deleted_at', null);
    if (opts.since) query = query.gte('created_at', opts.since);

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching audio_files:', error);
      process.exit(1);
    }
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

// `.in()` is chunked to keep the request URL within limits.
const IN_CHUNK = 300;

/**
 * Set of user ids (from `userIds`) that have paid — i.e. have at least one
 * `purchase`/`topup` credit transaction. Mirrors `hasUserPaid` in
 * apps/web/lib/supabase/queries.ts.
 */
async function fetchPaidUserIds(supabase, userIds) {
  const paid = new Set();
  for (let i = 0; i < userIds.length; i += IN_CHUNK) {
    const chunk = userIds.slice(i, i + IN_CHUNK);
    let from = 0;
    for (;;) {
      const { data, error } = await supabase
        .from('credit_transactions')
        .select('user_id')
        .in('user_id', chunk)
        .in('type', ['purchase', 'topup'])
        .range(from, from + PAGE_SIZE - 1);
      if (error) {
        console.error('Error fetching credit_transactions:', error);
        process.exit(1);
      }
      for (const t of data) paid.add(t.user_id);
      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
  }
  return paid;
}

function analyzeRow(row, opts) {
  const spoken = extractSpokenText(row.text_content);
  const spokenChars = spoken.length;
  const duration = toNumber(row.duration);
  const usage = parseUsage(row.usage);

  const promptTokens = toNumber(usage.promptTokenCount);
  const candidateTokens = toNumber(usage.candidatesTokenCount);
  const totalTokens = toNumber(usage.totalTokenCount);
  // Audio-output vs input-text token ratio: a full generation voices far more
  // than it reads (>2), a truncated one collapses toward/under ~1.
  const tokenOutInRatio =
    promptTokens && candidateTokens ? candidateTokens / promptTokens : null;

  const expectedDuration = spokenChars > 0 ? spokenChars / opts.normalCps : 0;

  const base = {
    id: row.id,
    userId: row.user_id,
    voiceId: row.voice_id,
    storageKey: row.storage_key,
    createdAt: row.created_at,
    status: row.status,
    deletedAt: row.deleted_at,
    creditsUsed: toNumber(row.credits_used),
    durationSeconds: duration,
    spokenChars,
    promptTokens,
    candidateTokens,
    totalTokens,
    tokenOutInRatio:
      tokenOutInRatio === null ? null : Number(tokenOutInRatio.toFixed(2)),
    expectedDurationSeconds: Number(expectedDuration.toFixed(1)),
  };

  // Duration was never measured — can't judge, report separately.
  if (duration === null || duration === UNKNOWN_DURATION) {
    return { ...base, category: 'unknown-duration', charsPerSec: null };
  }
  // Zero/negative duration with real text is broken audio.
  if (duration <= 0) {
    return {
      ...base,
      category: 'truncated',
      charsPerSec: spokenChars > 0 ? Number.POSITIVE_INFINITY : 0,
      deliveredPct: 0,
    };
  }

  const charsPerSec = spokenChars / duration;
  const deliveredPct =
    expectedDuration > 0
      ? Math.min(100, Math.round((duration / expectedDuration) * 100))
      : 100;

  const truncated =
    spokenChars >= opts.minChars && charsPerSec > opts.threshold;

  return {
    ...base,
    category: truncated ? 'truncated' : 'normal',
    charsPerSec: Number(charsPerSec.toFixed(1)),
    deliveredPct,
  };
}

function fmt(n, width) {
  return String(n).padStart(width);
}

const RULE = '='.repeat(110);

function printScanHeader(opts) {
  console.log('Scanning audio_files for truncated Gemini 3.1 Flash TTS output');
  console.log(`  model:        ${MODEL}`);
  console.log(`  user:         ${opts.user ?? 'ALL'}`);
  console.log(`  threshold:    > ${opts.threshold} chars/sec`);
  console.log(`  min chars:    ${opts.minChars}`);
  console.log(
    `  normal rate:  ${opts.normalCps} chars/sec (for expected duration)`,
  );
  console.log(`  active only:  ${opts.activeOnly}`);
  console.log(`  since:        ${opts.since ?? 'beginning'}`);
  console.log(`  paid only:    ${opts.paidOnly}\n`);
}

function printTruncatedTable(truncated) {
  console.log(RULE);
  console.log(
    'TRUNCATED / MISMATCHED FILES (audio far too short for the transcript)',
  );
  console.log(RULE);
  if (truncated.length === 0) {
    console.log('None found with the current threshold.\n');
    return;
  }
  console.log(
    `${'chars/s'.padStart(8)}  ${'dur(s)'.padStart(8)}  ${'chars'.padStart(6)}  ${'deliv%'.padStart(6)}  ${'credits'.padStart(7)}  ${'out/in'.padStart(6)}  id`,
  );
  for (const r of truncated) {
    const cps =
      r.charsPerSec === Number.POSITIVE_INFINITY ? '∞' : r.charsPerSec;
    console.log(
      `${fmt(cps, 8)}  ${fmt(r.durationSeconds, 8)}  ${fmt(r.spokenChars, 6)}  ${fmt(`${r.deliveredPct}%`, 6)}  ${fmt(r.creditsUsed ?? '?', 7)}  ${fmt(r.tokenOutInRatio ?? '?', 6)}  ${r.id}`,
    );
  }
  console.log('');
}

/**
 * One credits-only refund per user: refund the total credits billed for that
 * user's truncated files, with a reason. `refund-credits.mts` only takes the
 * user id on the CLI; the credit amount + reason are entered interactively.
 */
function buildRefundPlans(byUser, opts) {
  return [...byUser.entries()]
    .sort((a, b) => b[1].credits - a[1].credits)
    .map(([userId, acc]) => ({
      userId,
      files: acc.count,
      credits: acc.credits,
      ids: acc.ids,
      reason: `${opts.reason} (${acc.count} file${acc.count === 1 ? '' : 's'})`,
      command: `pnpm --filter @sexyvoice/scripts refund-credits -- ${userId}`,
    }));
}

function printRefundExposure(refundPlans) {
  console.log(RULE);
  console.log(
    'REFUND EXPOSURE BY USER (credits billed for the truncated files)',
  );
  console.log(RULE);
  for (const p of refundPlans) {
    console.log(`${p.userId}  files=${p.files}  credits=${p.credits}`);
  }
  console.log('');
}

function printRefundCommands(refundPlans) {
  console.log(RULE);
  console.log(
    'REFUND COMMANDS (credits-only "platform bug" refund via refund-credits.mts)',
  );
  console.log(RULE);
  if (refundPlans.length === 0) {
    console.log('Nothing to refund.\n');
    return;
  }
  console.log('Run one per user, answering the prompts as annotated:\n');
  for (const plan of refundPlans) {
    console.log(
      `# ${plan.userId} — ${plan.files} file${plan.files === 1 ? '' : 's'}, refund ${plan.credits} credits`,
    );
    console.log(plan.command);
    console.log(
      '#   transaction #  → press Enter   (skip = credits-only, no USD refund)',
    );
    console.log(`#   credits        → ${plan.credits}`);
    console.log(`#   reason         → ${plan.reason}`);
    console.log('');
  }
}

function printSummary(analyzed, normalCount, truncated, unknownDuration) {
  const totalCredits = truncated.reduce((s, r) => s + (r.creditsUsed ?? 0), 0);
  console.log(RULE);
  console.log('SUMMARY');
  console.log(RULE);
  console.log(`  scanned:            ${analyzed.length}`);
  console.log(`  normal:             ${normalCount}`);
  console.log(`  truncated:          ${truncated.length}`);
  console.log(
    `  unknown duration:   ${unknownDuration.length} (duration = -1, not judged)`,
  );
  console.log(`  total credits on truncated files: ${totalCredits}\n`);
  return totalCredits;
}

/** When --paid-only, drop rows whose user has no purchase/topup transaction. */
async function filterPaidOnly(supabase, rows, opts) {
  if (!opts.paidOnly) return rows;
  const userIds = [...new Set(rows.map((r) => r.user_id))];
  const paidUserIds = await fetchPaidUserIds(supabase, userIds);
  const scanRows = rows.filter((r) => paidUserIds.has(r.user_id));
  console.log(
    `Paid-only: ${paidUserIds.size}/${userIds.length} users paid; kept ${scanRows.length}/${rows.length} rows.`,
  );
  return scanRows;
}

/** Roll the flagged rows up per user for the refund exposure. */
function rollupByUser(truncated) {
  const byUser = new Map();
  for (const r of truncated) {
    const acc = byUser.get(r.userId) ?? { count: 0, credits: 0, ids: [] };
    acc.count += 1;
    acc.credits += r.creditsUsed ?? 0;
    acc.ids.push(r.id);
    byUser.set(r.userId, acc);
  }
  return byUser;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  opts.since = normalizeSince(opts.since);

  printScanHeader(opts);

  const supabase = createSupabase();
  const rows = await fetchAllRows(supabase, opts);
  console.log(`Fetched ${rows.length} '${MODEL}' rows.`);

  const scanRows = await filterPaidOnly(supabase, rows, opts);
  console.log('');

  const analyzed = scanRows.map((row) => analyzeRow(row, opts));

  const truncated = analyzed
    .filter((r) => r.category === 'truncated')
    // Worst first: highest chars/sec (Infinity sorts to the top).
    .sort((a, b) => (b.charsPerSec ?? 0) - (a.charsPerSec ?? 0));
  const unknownDuration = analyzed.filter(
    (r) => r.category === 'unknown-duration',
  );
  const normalCount = analyzed.filter((r) => r.category === 'normal').length;

  const refundPlans = buildRefundPlans(rollupByUser(truncated), opts);

  printTruncatedTable(truncated);
  printRefundExposure(refundPlans);
  printRefundCommands(refundPlans);
  const totalTruncatedCredits = printSummary(
    analyzed,
    normalCount,
    truncated,
    unknownDuration,
  );

  const report = {
    generatedFor: opts.user ?? 'ALL',
    since: opts.since,
    paidOnly: opts.paidOnly,
    model: MODEL,
    thresholds: {
      charsPerSecMax: opts.threshold,
      minChars: opts.minChars,
      normalCps: opts.normalCps,
    },
    summary: {
      scanned: analyzed.length,
      normal: normalCount,
      truncated: truncated.length,
      unknownDuration: unknownDuration.length,
      totalTruncatedCredits,
    },
    byUser: refundPlans,
    truncated,
    unknownDuration,
  };

  writeFileSync(opts.out, JSON.stringify(report, null, 2));
  console.log(`Detailed report written to: ${opts.out}`);
  console.log(
    'Review the flagged rows, then run the REFUND COMMANDS above (also in report.byUser).',
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
