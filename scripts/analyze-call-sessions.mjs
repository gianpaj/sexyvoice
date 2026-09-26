#!/usr/bin/env node

/**
 * Call Sessions Analysis Script (recent / daily cron)
 *
 * Analyzes recent call_sessions transcripts using xAI Grok and writes one rich
 * row per call to `call_session_analysis`, plus an aggregate row to
 * `call_session_analytics`. Sessions that already have a call_session_analysis
 * row are skipped.
 *
 * The prompt, analysis schema, transcript extraction and xAI Batch API client
 * are shared with the web app (apps/web/lib/ai/*) so this script, the backfill
 * script, the /api/call-sessions/analyze webhook and its batch drain job all
 * write identical rows. The TypeScript modules are loaded through Node's
 * native type stripping (see the `analyze-call-sessions` package script).
 *
 * Usage:
 *   pnpm analyze-call-sessions [--dry-run] [--hours=24] [--limit=100] [--debug] [--debug-session=UUID] [--smoke-test]
 *
 * Environment variables required:
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - SUPABASE_SECRET_KEY
 *   - XAI_API_KEY
 *   - XAI_SUMMARY_MODEL (optional; defaults to grok-4.3)
 *
 * Shared helpers are exported for scripts/backfill-call-analysis.mjs.
 */

import { fileURLToPath } from 'node:url';
import { createXai } from '@ai-sdk/xai';
import { createClient } from '@supabase/supabase-js';
import { generateText } from 'ai';
import { config } from 'dotenv';

import {
  analyzeTranscript,
  getAnalysisModelId,
  MIN_ANALYSIS_CALL_DURATION_SECONDS as SHARED_MIN_DURATION,
  toAnalysisRow,
} from '../apps/web/lib/ai/analyze-call.ts';
import {
  collectCallAnalysisBatchResults,
  submitCallAnalysisBatch,
} from '../apps/web/lib/ai/call-analysis-batch.ts';
import { waitForBatch } from '../apps/web/lib/ai/xai-batch.ts';

config({
  override: false,
  path: [
    '.env',
    '.env.local',
    '../.env',
    '../.env.local',
    '../apps/web/.env',
    '../apps/web/.env.local',
  ],
});

// ============================================================================
// Configuration
// ============================================================================

export const BATCH_SIZE = 5; // calls per chunk (sequential LLM calls)
export const MIN_ANALYSIS_CALL_DURATION_SECONDS = SHARED_MIN_DURATION;
export const LONG_CALL_THRESHOLD_SECONDS = 180; // 3 minutes
const OUTPUT_FILE_PREFIX = 'call-analysis-results';
const DB_FETCH_PAGE_SIZE = 1000;

// xAI Batch API: async, discounted, no per-request rate limits. Default engine
// for both the recent cron and the backfill; --realtime opts back into the
// synchronous AI SDK path. The client lives in apps/web/lib/ai/xai-batch.ts and
// honours XAI_API_BASE_URL. See https://docs.x.ai/developers/advanced-api-usage/batch-api
const BATCH_POLL_INTERVAL_MS = 5000; // xAI recommends 2-5s between status polls
export const DEFAULT_BATCH_TIMEOUT_MINUTES = 60;

// ============================================================================
// Clients
// ============================================================================

export function createAdminClient() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    throw new Error('Missing env.NEXT_PUBLIC_SUPABASE_URL');
  }
  if (!process.env.SUPABASE_SECRET_KEY) {
    throw new Error('Missing env.SUPABASE_SECRET_KEY');
  }

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SECRET_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export function createXaiClient() {
  if (!process.env.XAI_API_KEY) {
    throw new Error('Missing env.XAI_API_KEY');
  }
  return createXai({ apiKey: process.env.XAI_API_KEY });
}

export function getModelId() {
  return getAnalysisModelId();
}

// ============================================================================
// CLI
// ============================================================================

function parseArgs() {
  const options = {
    batchTimeoutMinutes: DEFAULT_BATCH_TIMEOUT_MINUTES,
    debug: false,
    debugSession: null,
    dryRun: false,
    hours: 24,
    limit: null,
    realtime: false,
    smokeTest: false,
  };

  for (const arg of process.argv.slice(2)) {
    const [key, ...rest] = arg.split('=');
    const value = rest.join('=');
    switch (key) {
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--hours':
        options.hours = Number.parseInt(value, 10);
        break;
      case '--limit':
        options.limit = Number.parseInt(value, 10);
        break;
      case '--debug':
        options.debug = true;
        break;
      case '--debug-session':
        options.debugSession = value || null;
        options.debug = true;
        break;
      case '--smoke-test':
        options.smokeTest = true;
        options.debug = true;
        break;
      case '--realtime':
      case '--no-batch':
        options.realtime = true;
        break;
      case '--batch-timeout':
        options.batchTimeoutMinutes = Number.parseInt(value, 10);
        break;
      case '--help':
      case '-h':
        console.log(`
Call Sessions Analysis Script (recent / daily cron)

Usage:
  node scripts/analyze-call-sessions.mjs [options]

Options:
  --dry-run            Run without writing to the database (writes CSV + insights)
  --hours=N            Analyze calls started in the last N hours (default: 24)
  --limit=N            Limit the number of calls to analyze
  --debug              Verbose logging
  --debug-session=UUID Only analyze/debug a specific session id
  --smoke-test         Run a tiny xAI request first to validate the model id
  --realtime           Use synchronous xAI calls instead of the Batch API
  --batch-timeout=N    Minutes to wait for the batch to finish (default: ${DEFAULT_BATCH_TIMEOUT_MINUTES})
  -h, --help           Show this help
      `);
        process.exit(0);
        break;
      default:
        break;
    }
  }

  return options;
}

// ============================================================================
// Database queries
// ============================================================================

const SESSION_COLUMNS =
  'id, user_id, model, voice_id, started_at, ended_at, duration_seconds, status, end_reason, transcript, created_at';

// Embed call_session_analysis and keep only parent rows with no match. With the
// unique constraint on session_id this is a true 1:1 anti-join, so PostgREST
// returns unanalyzed sessions in a single round-trip (no in-memory filtering).
const SELECT_WITH_ANTI_JOIN = `${SESSION_COLUMNS}, call_session_analysis!left(id)`;

async function getRecentCallSessions(supabase, hoursAgo, limit = null) {
  const cutoffTime = new Date(
    Date.now() - hoursAgo * 60 * 60 * 1000,
  ).toISOString();

  let query = supabase
    .from('call_sessions')
    .select(SELECT_WITH_ANTI_JOIN)
    .is('call_session_analysis', null)
    .gte('started_at', cutoffTime)
    .eq('status', 'completed')
    .not('transcript', 'is', null)
    .gte('duration_seconds', MIN_ANALYSIS_CALL_DURATION_SECONDS)
    .order('started_at', { ascending: false });

  if (limit) {
    query = query.limit(limit);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Error fetching call sessions: ${error.message}`);
  }

  return data || [];
}

/**
 * Fetch all completed, unanalyzed call sessions with a transcript (paginated).
 * Used by the backfill script.
 */
export async function getAllCompletedCallSessions(supabase, options = {}) {
  const { minDuration = MIN_ANALYSIS_CALL_DURATION_SECONDS, models = [] } =
    options;
  const rows = [];
  let from = 0;

  while (true) {
    let query = supabase
      .from('call_sessions')
      .select(SELECT_WITH_ANTI_JOIN)
      .is('call_session_analysis', null)
      .eq('status', 'completed')
      .not('transcript', 'is', null)
      .gte('duration_seconds', minDuration)
      .order('started_at', { ascending: false })
      .range(from, from + DB_FETCH_PAGE_SIZE - 1);

    if (models.length > 0) {
      query = query.in('model', models);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(`Error fetching call sessions: ${error.message}`);
    }
    if (!data || data.length === 0) {
      break;
    }

    rows.push(...data);
    if (data.length < DB_FETCH_PAGE_SIZE) {
      break;
    }
    from += DB_FETCH_PAGE_SIZE;
  }

  return rows;
}

// Result rows carry the session fields needed by the shared row mapper.
function buildAnalysisRecord(result) {
  return toAnalysisRow(
    {
      duration_seconds: result.durationSeconds ?? null,
      end_reason: result.endReason ?? null,
      id: result.sessionId,
      started_at: result.startedAt ?? null,
      transcript: null,
      user_id: result.userId ?? null,
    },
    result.analysis,
  );
}

export async function saveAllSessionAnalyses(supabase, results) {
  let successCount = 0;
  let errorCount = 0;
  let skippedCount = 0;

  for (const result of results) {
    // Never persist a row for a failed analysis: a row would permanently
    // exclude the session from future runs (and the webhook deliberately does
    // the same), so failures stay retryable.
    if (result.error || !result.analysis) {
      skippedCount += 1;
      continue;
    }

    // Upsert against the unique session_id so a concurrent webhook/run can't
    // create a duplicate.
    const { error } = await supabase
      .from('call_session_analysis')
      .upsert(buildAnalysisRecord(result), {
        ignoreDuplicates: true,
        onConflict: 'session_id',
      });
    if (error) {
      console.error(
        `   ❌ Failed to save analysis for session ${result.sessionId}: ${error.message}`,
      );
      errorCount += 1;
    } else {
      successCount += 1;
    }
  }

  console.log(`   ✅ Saved ${successCount} session analyses`);
  if (skippedCount > 0) {
    console.log(
      `   ⏭️ Skipped ${skippedCount} failed analyses (left for retry)`,
    );
  }
  if (errorCount > 0) {
    console.log(`   ❌ Failed to save ${errorCount} session analyses`);
  }
  return { errorCount, skippedCount, successCount };
}

export async function saveAnalyticsRecord(supabase, analyticsData) {
  const { error } = await supabase
    .from('call_session_analytics')
    .insert(analyticsData);
  if (error) {
    console.warn(
      `⚠️ Could not save to call_session_analytics: ${error.message}`,
    );
    return false;
  }
  return true;
}

// ============================================================================
// LLM analysis
// ============================================================================

export async function runSmokeTest(xai) {
  const { text } = await generateText({
    model: xai(getModelId()),
    prompt: 'Reply with exactly this plain text and nothing else: healthy',
  });
  return text;
}

function sessionBase(session) {
  return {
    durationSeconds: session.duration_seconds,
    endReason: session.end_reason,
    sessionId: session.id,
    startedAt: session.started_at,
    userId: session.user_id,
  };
}

export async function analyzeCallSessionsWithLLM(sessions, options = {}) {
  const results = [];

  for (const session of sessions) {
    if (options.debugSession && session.id !== options.debugSession) {
      continue;
    }

    try {
      // Same synchronous generateObject path as the webhook's realtime bypass.
      const analysis = await analyzeTranscript(session);
      results.push({ ...sessionBase(session), analysis });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`❌ Error analyzing session ${session.id}: ${message}`);
      results.push({ ...sessionBase(session), error: message });
    }
  }

  return results;
}

async function processSessionsRealtime(sessions, options) {
  console.log(
    '\n🤖 Analyzing sessions with Grok via the AI SDK (real-time)...',
  );
  const allResults = [];

  for (let i = 0; i < sessions.length; i += BATCH_SIZE) {
    const batch = sessions.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(sessions.length / BATCH_SIZE);
    console.log(
      `   Processing batch ${batchNum}/${totalBatches} (${batch.length} sessions)...`,
    );

    const batchResults = await analyzeCallSessionsWithLLM(batch, options);
    allResults.push(...batchResults);

    if (i + BATCH_SIZE < sessions.length) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  return allResults;
}

// ============================================================================
// xAI Batch API (async: upload JSONL -> create batch -> poll -> retrieve)
// ============================================================================

export async function analyzeCallSessionsWithBatchApi(sessions, options = {}) {
  const targetSessions = options.debugSession
    ? sessions.filter((session) => session.id === options.debugSession)
    : sessions;
  const bySessionId = new Map(targetSessions.map((s) => [s.id, s]));

  const submission = await submitCallAnalysisBatch(
    targetSessions,
    getModelId(),
  );
  const results = submission.rejected.map((rejected) => ({
    ...sessionBase(bySessionId.get(rejected.sessionId)),
    error: rejected.error,
  }));

  if (!submission.batchId) {
    return results;
  }

  const { batchId, contexts } = submission;
  console.log(
    `   Uploaded ${contexts.size} requests; batch ${batchId} created, waiting for completion...`,
  );

  const timeoutMinutes =
    options.batchTimeoutMinutes ?? DEFAULT_BATCH_TIMEOUT_MINUTES;
  let lastLine = '';
  const { settled } = await waitForBatch(batchId, {
    onPoll: (state) => {
      const errors = state.num_error ?? 0;
      const cancelled = state.num_cancelled ?? 0;
      const line = `   ⏳ batch ${batchId}: ${state.num_success ?? 0} done, ${
        state.num_pending ?? 0
      } pending${errors ? `, ${errors} errors` : ''}${
        cancelled ? `, ${cancelled} cancelled` : ''
      }`;
      if (line !== lastLine) {
        console.log(line);
        lastLine = line;
      }
    },
    pollIntervalMs: BATCH_POLL_INTERVAL_MS,
    timeoutMs: timeoutMinutes * 60_000,
  });
  if (!settled) {
    throw new Error(
      `Batch ${batchId} did not finish within ${timeoutMinutes} minutes. ` +
        'Re-run later to retrieve results or inspect it in the xAI console.',
    );
  }

  const batchResults = await collectCallAnalysisBatchResults(batchId, contexts);
  console.log(`   Retrieved ${batchResults.length} batch results`);

  for (const result of batchResults) {
    const base = sessionBase(bySessionId.get(result.sessionId));
    if (result.error) {
      console.error(
        `❌ Batch analysis failed for session ${result.sessionId}: ${result.error}`,
      );
      results.push({ ...base, error: result.error });
    } else {
      results.push({ ...base, analysis: result.analysis });
    }
  }

  return results;
}

export function processSessionsInBatches(sessions, options = {}) {
  if (options.realtime) {
    return processSessionsRealtime(sessions, options);
  }
  console.log('\n🤖 Analyzing sessions with Grok via the xAI Batch API...');
  return analyzeCallSessionsWithBatchApi(sessions, options);
}

// ============================================================================
// Aggregation & output
// ============================================================================

function incrementCount(distribution, key) {
  distribution[key] = (distribution[key] || 0) + 1;
}

export function aggregateInsights(analysisResults) {
  const validResults = analysisResults.filter((r) => r.analysis && !r.error);
  const languageDistribution = {};
  const topicDistribution = {};
  const engagementLevels = {};

  for (const r of validResults) {
    incrementCount(languageDistribution, r.analysis.language || 'unknown');
    incrementCount(topicDistribution, r.analysis.topic_category || 'unknown');
    incrementCount(
      engagementLevels,
      r.analysis.user_engagement_level || 'unknown',
    );
  }

  const allRequests = validResults
    .filter((r) => Array.isArray(r.analysis.key_user_requests))
    .flatMap((r) => r.analysis.key_user_requests);
  const requestFrequency = {};
  for (const req of allRequests) {
    incrementCount(requestFrequency, String(req).toLowerCase().trim());
  }
  const topUserRequests = Object.entries(requestFrequency)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([request, count]) => ({ count, request }));

  return {
    engagementLevels,
    errors: analysisResults.filter((r) => r.error).length,
    languageDistribution,
    popularTopics: Object.entries(topicDistribution)
      .sort(([, a], [, b]) => b - a)
      .map(([topic, count]) => ({ count, topic })),
    topicDistribution,
    topUserRequests,
    totalAnalyzed: analysisResults.length,
    validAnalyses: validResults.length,
  };
}

export async function saveResultsToCSV(results, filename) {
  const { writeFile } = await import('node:fs/promises');
  const headers = [
    'Session ID',
    'User ID',
    'Started At',
    'Duration (s)',
    'End Reason',
    'Language',
    'Topic Category',
    'Topic Subcategory',
    'Engagement Level',
    'Conversation Quality',
    'Where Died',
    'User Sentiment',
    'Key Requests',
    'AI Issues',
    'Notable Patterns',
    'Error',
  ];

  const rows = results.map((r) => [
    r.sessionId,
    r.userId || '',
    r.startedAt || '',
    r.durationSeconds || '',
    r.endReason || '',
    r.analysis?.language || '',
    r.analysis?.topic_category || '',
    r.analysis?.topic_subcategory || '',
    r.analysis?.user_engagement_level || '',
    r.analysis?.conversation_quality || '',
    r.analysis?.where_conversation_died || '',
    r.analysis?.user_sentiment || '',
    JSON.stringify(r.analysis?.key_user_requests || []),
    r.analysis?.ai_compliance_issues || '',
    r.analysis?.notable_patterns || '',
    r.error || '',
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','),
    ),
  ].join('\n');

  await writeFile(filename, csvContent);
  console.log(`📄 Results saved to: ${filename}`);
}

export async function saveResults(
  allResults,
  insights,
  prefix = OUTPUT_FILE_PREFIX,
) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  await saveResultsToCSV(allResults, `${prefix}-${timestamp}.csv`);
  const { writeFile } = await import('node:fs/promises');
  const jsonFilename = `${prefix}-${timestamp}-insights.json`;
  await writeFile(jsonFilename, JSON.stringify(insights, null, 2));
  console.log(`📄 Insights saved to: ${jsonFilename}`);
}

export function printSummaryReport(insights) {
  console.log(`\n${'═'.repeat(70)}`);
  console.log('📊 CALL SESSIONS ANALYSIS REPORT');
  console.log('═'.repeat(70));
  console.log(`   Total analyzed: ${insights.totalAnalyzed}`);
  console.log(`   Successful: ${insights.validAnalyses}`);
  console.log(`   Errors: ${insights.errors}`);

  if (insights.validAnalyses > 0) {
    console.log('\n🌍 Language distribution:');
    for (const [lang, count] of Object.entries(
      insights.languageDistribution,
    ).sort(([, a], [, b]) => b - a)) {
      console.log(`   ${lang}: ${count}`);
    }
    console.log('\n📁 Topics (most → least popular):');
    for (const { topic, count } of insights.popularTopics) {
      console.log(`   ${topic}: ${count}`);
    }
  }
  console.log(`\n${'═'.repeat(70)}`);
}

export async function persistResults(supabase, allResults, insights, options) {
  await saveAllSessionAnalyses(supabase, allResults);
  await saveAnalyticsRecord(supabase, {
    analysis_date: new Date().toISOString(),
    insights,
    time_range_hours: options.timeRangeHours ?? options.hours ?? 0,
    total_sessions_analyzed: allResults.length,
  });
}

// ============================================================================
// Main (recent / daily-cron mode)
// ============================================================================

async function main() {
  const options = parseArgs();
  console.log('🚀 Call Sessions Analysis (recent)');
  console.log(`   Mode: ${options.dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`   Engine: ${options.realtime ? 'real-time' : 'Batch API'}`);
  console.log(
    `   Time range: last ${options.hours}h, limit ${options.limit || 'none'}`,
  );

  const supabase = createAdminClient();

  if (options.smokeTest) {
    console.log('\n🧪 xAI smoke test:', await runSmokeTest(createXaiClient()));
  }

  console.log('\n📥 Fetching recent unanalyzed call sessions...');
  const sessions = await getRecentCallSessions(
    supabase,
    options.hours,
    options.limit,
  );
  console.log(`   Found ${sessions.length} sessions to analyze`);
  if (sessions.length === 0) {
    console.log('\n✅ Nothing to analyze. Exiting.');
    return;
  }

  const allResults = await processSessionsInBatches(sessions, options);
  const insights = aggregateInsights(allResults);
  printSummaryReport(insights);

  if (options.dryRun) {
    console.log('\n⏭️ Dry run - writing CSV/insights, skipping DB');
    await saveResults(allResults, insights);
  } else {
    await persistResults(supabase, allResults, insights, {
      timeRangeHours: options.hours,
    });
  }

  console.log('\n✅ Analysis complete!');
}

// Only run when executed directly (not when imported by the backfill script).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
}
