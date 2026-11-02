#!/usr/bin/env node

/**
 * Find `gemini-3.1-flash-tts-preview` audio_files whose audio duration is a
 * possible mismatch for the stored transcript. Short outputs are truncation
 * candidates. Abnormally long outputs are review-only quality signals. Neither
 * heuristic proves that a refund is due.
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
 * chars-per-second. A very high value can identify audio that is far too short
 * for its transcript. Speech rate, prompt structure, metadata quality, and
 * delivery defects can all affect the result, so independently inspect every
 * flagged artifact. Example rows from a prior report:
 *   - strong candidate: ~2400 spoken chars /  7.08s ≈ 340 cps
 *   - not flagged:      ~1050 spoken chars / 70.24s ≈  15 cps
 *
 * The script also flags audio longer than `expected duration * --long-factor`,
 * where expected duration is `spoken chars / --normal-cps`. Long outputs never
 * enter refund exposure or refund commands.
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
 *   --long-factor <n>   Review output longer than expected by this factor
 *                       (default: 2; must be greater than 1).
 *   --active-only       Skip soft-deleted rows (deleted_at not null).
 *   --since <date>      Only scan files created on/after this date/timestamp,
 *                       ISO-parseable (e.g. 2026-06-01 or 2026-06-01T00:00:00Z).
 *   --until <date>      Only scan files created on/before this date/timestamp.
 *   --paid-only         Only scan users who have paid (a purchase/topup credit
 *                       transaction). Freemium-only users can't be refunded.
 *   --out <path>        JSON report path (default: ./truncated-gemini31-tts.json).
 *   --reason <text>     Refund reason printed in the generated refund commands.
 *
 * The report includes a separate `REVIEW-ONLY LONG OUTPUTS` table and an
 * `abnormallyLong` JSON array. It also includes conditional `refund-credits.mts`
 * commands for short-output candidates only. A human must independently confirm
 * affected files and approve any refund amount.
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY (read-only use).
 */

import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
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
    activeOnly: false,
    longFactor: 2,
    minChars: 150,
    normalCps: 15,
    out: './truncated-gemini31-tts.json',
    paidOnly: false,
    reason:
      'Truncated Gemini 3.1 Flash TTS: billed for the full transcript but only a few seconds of audio were generated',
    since: null,
    threshold: 30,
    until: null,
    user: null,
  };
  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    const next = () => argv[++i];
    switch (arg) {
      case '--':
        break;
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
      case '--long-factor':
        opts.longFactor = Number(next());
        break;
      case '--active-only':
        opts.activeOnly = true;
        break;
      case '--since':
        opts.since = next();
        break;
      case '--until':
        opts.until = next();
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
          'See the header of this file for options. Common: --user <uuid> --since <iso> --until <iso> --long-factor <n>',
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
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!(url && key)) {
    console.error('Missing required environment variables:');
    console.error('  - NEXT_PUBLIC_SUPABASE_URL');
    console.error('  - SUPABASE_SECRET_KEY');
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

/** Validate a time bound and normalize it to an ISO string for the query. */
function normalizeTimeBound(value, option) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    console.error(
      `Invalid ${option} date: "${value}". Use an ISO date/timestamp, e.g. 2026-06-01.`,
    );
    process.exit(1);
  }
  return date.toISOString();
}

function validateLongFactor(value) {
  if (!(Number.isFinite(value) && value > 1)) {
    console.error('--long-factor must be a number greater than 1.');
    process.exit(1);
  }
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
    if (opts.until) query = query.lte('created_at', opts.until);

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

export function analyzeRow(row, opts) {
  const spoken = extractSpokenText(row.text_content);
  const spokenChars = spoken.length;
  const duration = toNumber(row.duration);
  const usage = parseUsage(row.usage);

  const promptTokens = toNumber(usage.promptTokenCount);
  const candidateTokens = toNumber(usage.candidatesTokenCount);
  const totalTokens = toNumber(usage.totalTokenCount);
  // Audio-output vs input-text token ratio: a full generation voices far more
  // than it reads (>2); a truncation candidate may collapse toward/under ~1.
  const tokenOutInRatio =
    promptTokens && candidateTokens ? candidateTokens / promptTokens : null;

  const expectedDuration = spokenChars > 0 ? spokenChars / opts.normalCps : 0;

  const base = {
    actualToExpectedRatio: null,
    candidateTokens,
    createdAt: row.created_at,
    creditsUsed: toNumber(row.credits_used),
    deletedAt: row.deleted_at,
    durationSeconds: duration,
    expectedDurationSeconds: Number(expectedDuration.toFixed(1)),
    id: row.id,
    promptTokens,
    spokenChars,
    status: row.status,
    storageKey: row.storage_key,
    tokenOutInRatio:
      tokenOutInRatio === null ? null : Number(tokenOutInRatio.toFixed(2)),
    totalTokens,
    userId: row.user_id,
    voiceId: row.voice_id,
  };

  // Duration was never measured — can't judge, report separately.
  if (duration === null || duration === UNKNOWN_DURATION) {
    return { ...base, category: 'unknown-duration', charsPerSec: null };
  }
  // Zero/negative duration with real text is broken audio.
  if (duration <= 0) {
    return {
      ...base,
      actualToExpectedRatio: expectedDuration > 0 ? 0 : null,
      category: 'candidate',
      charsPerSec: spokenChars > 0 ? Number.POSITIVE_INFINITY : 0,
      deliveredPct: 0,
    };
  }

  const charsPerSec = spokenChars / duration;
  const actualToExpectedRatio =
    expectedDuration > 0 ? duration / expectedDuration : null;
  const deliveredPct =
    expectedDuration > 0
      ? Math.min(100, Math.round((duration / expectedDuration) * 100))
      : 100;

  const isCandidate =
    spokenChars >= opts.minChars && charsPerSec > opts.threshold;
  const isAbnormallyLong =
    spokenChars >= opts.minChars &&
    actualToExpectedRatio !== null &&
    actualToExpectedRatio > opts.longFactor;
  let category = 'not-flagged';
  if (isCandidate) {
    category = 'candidate';
  } else if (isAbnormallyLong) {
    category = 'abnormally-long';
  }

  return {
    ...base,
    actualToExpectedRatio:
      actualToExpectedRatio === null
        ? null
        : Number(actualToExpectedRatio.toFixed(2)),
    category,
    charsPerSec: Number(charsPerSec.toFixed(1)),
    deliveredPct,
  };
}

function fmt(n, width) {
  return String(n).padStart(width);
}

const RULE = '='.repeat(110);

function printScanHeader(opts) {
  console.log(
    'Scanning audio_files for possible Gemini 3.1 Flash TTS duration mismatches',
  );
  console.log(`  model:        ${MODEL}`);
  console.log(`  user:         ${opts.user ?? 'ALL'}`);
  console.log(`  threshold:    > ${opts.threshold} chars/sec`);
  console.log(`  min chars:    ${opts.minChars}`);
  console.log(
    `  normal rate:  ${opts.normalCps} chars/sec (for expected duration)`,
  );
  console.log(`  long factor:  > ${opts.longFactor}x expected duration`);
  console.log(`  active only:  ${opts.activeOnly}`);
  console.log(`  since:        ${opts.since ?? 'beginning'}`);
  console.log(`  until:        ${opts.until ?? 'now'}`);
  console.log(`  paid only:    ${opts.paidOnly}\n`);
}

function printCandidateTable(candidates) {
  console.log(RULE);
  console.log(
    'TRUNCATION CANDIDATES (duration is short for the stored transcript)',
  );
  console.log(RULE);
  if (candidates.length === 0) {
    console.log('None found with the current threshold.\n');
    return;
  }
  console.log(
    `${'chars/s'.padStart(8)}  ${'dur(s)'.padStart(8)}  ${'chars'.padStart(6)}  ${'deliv%'.padStart(6)}  ${'credits'.padStart(7)}  ${'out/in'.padStart(6)}  id`,
  );
  for (const r of candidates) {
    const cps =
      r.charsPerSec === Number.POSITIVE_INFINITY ? '∞' : r.charsPerSec;
    console.log(
      `${fmt(cps, 8)}  ${fmt(r.durationSeconds, 8)}  ${fmt(r.spokenChars, 6)}  ${fmt(`${r.deliveredPct}%`, 6)}  ${fmt(r.creditsUsed ?? '?', 7)}  ${fmt(r.tokenOutInRatio ?? '?', 6)}  ${r.id}`,
    );
  }
  console.log('');
}

function printAbnormallyLongTable(abnormallyLong, opts) {
  console.log(RULE);
  console.log(
    `REVIEW-ONLY LONG OUTPUTS (duration exceeds expected by ${opts.longFactor}x)`,
  );
  console.log(RULE);
  if (abnormallyLong.length === 0) {
    console.log('None found with the current long-output factor.\n');
    return;
  }
  console.log(
    `${'actual/expected'.padStart(15)}  ${'dur(s)'.padStart(8)}  ${'expect(s)'.padStart(9)}  ${'chars'.padStart(6)}  ${'credits'.padStart(7)}  id`,
  );
  for (const row of abnormallyLong) {
    console.log(
      `${fmt(`${row.actualToExpectedRatio}x`, 15)}  ${fmt(row.durationSeconds, 8)}  ${fmt(row.expectedDurationSeconds, 9)}  ${fmt(row.spokenChars, 6)}  ${fmt(row.creditsUsed ?? '?', 7)}  ${row.id}`,
    );
  }
  console.log(
    '\nReview these artifacts manually. Long-output anomalies are not included in refund exposure or refund commands.\n',
  );
}

/**
 * Build conditional review plans. The human-approved follow-up can use the
 * included command only after the candidate files and credit amount are
 * independently confirmed.
 */
function buildReviewPlans(byUser, opts) {
  return [...byUser.entries()]
    .sort((a, b) => b[1].credits - a[1].credits)
    .map(([userId, acc]) => ({
      command: `pnpm --filter @sexyvoice/scripts refund-credits -- ${userId}`,
      credits: acc.credits,
      files: acc.count,
      ids: acc.ids,
      reason: `${opts.reason} (${acc.count} file${acc.count === 1 ? '' : 's'})`,
      userId,
    }));
}

function printCandidateExposure(reviewPlans) {
  console.log(RULE);
  console.log('CANDIDATE CREDIT EXPOSURE (not a confirmed refund amount)');
  console.log(RULE);
  for (const p of reviewPlans) {
    console.log(`${p.userId}  files=${p.files}  credits=${p.credits}`);
  }
  console.log('');
}

function printConditionalRefundCommands(reviewPlans) {
  console.log(RULE);
  console.log(
    'CONDITIONAL REFUND COMMANDS (require confirmation and human approval)',
  );
  console.log(RULE);
  if (reviewPlans.length === 0) {
    console.log('No candidate commands.\n');
    return;
  }
  console.log(
    'Do not run these from this heuristic alone. After independent confirmation and explicit human approval, run one per user:\n',
  );
  for (const plan of reviewPlans) {
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

function printSummary(
  analyzed,
  notFlaggedCount,
  candidates,
  abnormallyLong,
  unknownDuration,
) {
  const candidateCredits = candidates.reduce(
    (sum, row) => sum + (row.creditsUsed ?? 0),
    0,
  );
  console.log(RULE);
  console.log('SUMMARY');
  console.log(RULE);
  console.log(`  scanned:            ${analyzed.length}`);
  console.log(`  not flagged:        ${notFlaggedCount}`);
  console.log(`  candidates:         ${candidates.length}`);
  console.log(`  review-only long:   ${abnormallyLong.length}`);
  console.log(
    `  unknown duration:   ${unknownDuration.length} (duration = -1, not judged)`,
  );
  console.log(`  candidate credits requiring review: ${candidateCredits}\n`);
  return candidateCredits;
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

/** Roll the candidate rows up per user for human review. */
function rollupByUser(candidates) {
  const byUser = new Map();
  for (const r of candidates) {
    const acc = byUser.get(r.userId) ?? { count: 0, credits: 0, ids: [] };
    acc.count += 1;
    acc.credits += r.creditsUsed ?? 0;
    acc.ids.push(r.id);
    byUser.set(r.userId, acc);
  }
  return byUser;
}

/** Separate review-only anomalies from candidates that may affect refunds. */
export function partitionAnalyzed(analyzed) {
  const candidates = analyzed
    .filter((row) => row.category === 'candidate')
    // Worst first: highest chars/sec (Infinity sorts to the top).
    .sort((a, b) => (b.charsPerSec ?? 0) - (a.charsPerSec ?? 0));
  const abnormallyLong = analyzed
    .filter((row) => row.category === 'abnormally-long')
    .sort(
      (a, b) => (b.actualToExpectedRatio ?? 0) - (a.actualToExpectedRatio ?? 0),
    );
  const notFlaggedCount = analyzed.filter(
    (row) => row.category === 'not-flagged',
  ).length;
  const unknownDuration = analyzed.filter(
    (row) => row.category === 'unknown-duration',
  );

  return { abnormallyLong, candidates, notFlaggedCount, unknownDuration };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  validateLongFactor(opts.longFactor);
  opts.since = normalizeTimeBound(opts.since, '--since');
  opts.until = normalizeTimeBound(opts.until, '--until');
  if (opts.since && opts.until && opts.since > opts.until) {
    console.error('--since must be earlier than or equal to --until.');
    process.exit(1);
  }

  printScanHeader(opts);

  const supabase = createSupabase();
  const rows = await fetchAllRows(supabase, opts);
  console.log(`Fetched ${rows.length} '${MODEL}' rows.`);

  const scanRows = await filterPaidOnly(supabase, rows, opts);
  console.log('');

  const analyzed = scanRows.map((row) => analyzeRow(row, opts));
  const { abnormallyLong, candidates, notFlaggedCount, unknownDuration } =
    partitionAnalyzed(analyzed);

  const reviewPlans = buildReviewPlans(rollupByUser(candidates), opts);

  printCandidateTable(candidates);
  printAbnormallyLongTable(abnormallyLong, opts);
  printCandidateExposure(reviewPlans);
  printConditionalRefundCommands(reviewPlans);
  const candidateCredits = printSummary(
    analyzed,
    notFlaggedCount,
    candidates,
    abnormallyLong,
    unknownDuration,
  );

  const report = {
    abnormallyLong,
    candidates,
    generatedFor: opts.user ?? 'ALL',
    interpretation: {
      heuristicOnly: true,
      longOutputsExcludedFromRefundPlans: true,
      longOutputsReviewOnly: true,
      requiresHumanApprovalBeforeRefund: true,
      requiresIndependentConfirmation: true,
    },
    model: MODEL,
    paidOnly: opts.paidOnly,
    reviewPlansByUser: reviewPlans,
    since: opts.since,
    summary: {
      abnormallyLong: abnormallyLong.length,
      candidateCredits,
      candidates: candidates.length,
      notFlagged: notFlaggedCount,
      scanned: analyzed.length,
      unknownDuration: unknownDuration.length,
    },
    thresholds: {
      charsPerSecMax: opts.threshold,
      longFactor: opts.longFactor,
      minChars: opts.minChars,
      normalCps: opts.normalCps,
    },
    unknownDuration,
    until: opts.until,
  };

  writeFileSync(opts.out, JSON.stringify(report, null, 2));
  console.log(`Detailed report written to: ${opts.out}`);
  console.log(
    'Confirm short-output candidates independently before proposing a refund for human approval. Treat long-output anomalies as review-only.',
  );
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
