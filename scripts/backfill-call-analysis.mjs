#!/usr/bin/env node

/**
 * Backfill Call Analysis Script
 *
 * One-off / catch-up analysis of ALL completed call_sessions that have a usable
 * transcript and no call_session_analysis row yet. Modeled on the batch/scalable
 * structure of analyze-audio-files-language.mjs (paginated candidate fetch,
 * filters, --dry-run, CSV + insights output), but reuses the exact prompt,
 * transcript extraction and analysis schema from analyze-call-sessions.mjs so the
 * rows it writes are identical to the webhook and recent-cron paths.
 *
 * Usage:
 *   node scripts/backfill-call-analysis.mjs [options]
 *
 * Options:
 *   --dry-run            Run without writing to the database (writes CSV + insights)
 *   --limit=N            Only analyze the N most recent candidates
 *   --min-duration=N     Minimum call duration in seconds (default: 120)
 *   --models=a,b,c       Only analyze these call models
 *   --retry-failed       Include sessions the analysis queue parked as failed
 *   --debug              Verbose logging
 *   --debug-session=UUID Only analyze a specific session id
 *   --smoke-test         Run a tiny xAI request first to validate the model id
 *   -h, --help           Show this help
 *
 * Environment variables required:
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - SUPABASE_SECRET_KEY
 *   - XAI_API_KEY
 *   - XAI_SUMMARY_MODEL (optional; defaults to grok-4.3)
 */

import {
  aggregateInsights,
  createXaiClient,
  DEFAULT_BATCH_TIMEOUT_MINUTES,
  getAllCompletedCallSessions,
  MIN_ANALYSIS_CALL_DURATION_SECONDS,
  persistResults,
  printSummaryReport,
  processSessionsInBatches,
  runSmokeTest,
  saveResults,
} from './analyze-call-sessions.mjs';
import { loadScriptEnv, parseCliArgs, runScript } from './lib/cli.mts';
import { createScriptAdminClient } from './lib/supabase.mts';

function parseArgs() {
  const { values } = parseCliArgs({
    options: {
      'batch-timeout': { type: 'string' },
      debug: { type: 'boolean' },
      'debug-session': { type: 'string' },
      'dry-run': { type: 'boolean' },
      help: { short: 'h', type: 'boolean' },
      limit: { type: 'string' },
      'min-duration': { type: 'string' },
      models: { type: 'string' },
      'no-batch': { type: 'boolean' },
      realtime: { type: 'boolean' },
      'retry-failed': { type: 'boolean' },
      'smoke-test': { type: 'boolean' },
    },
  });
  if (values.help) {
    console.log(`
Backfill Call Analysis Script

Usage:
  node scripts/backfill-call-analysis.mjs [options]

Options:
  --dry-run            Run without writing to the database (writes CSV + insights)
  --limit=N            Only analyze the N most recent candidates
  --min-duration=N     Minimum call duration in seconds (default: ${MIN_ANALYSIS_CALL_DURATION_SECONDS})
  --models=a,b,c       Only analyze these call models
  --retry-failed       Include sessions the analysis queue parked as failed
  --debug              Verbose logging
  --debug-session=UUID Only analyze a specific session id
  --smoke-test         Run a tiny xAI request first to validate the model id
  --realtime           Use synchronous xAI calls instead of the Batch API
  --batch-timeout=N    Minutes to wait for the batch to finish (default: ${DEFAULT_BATCH_TIMEOUT_MINUTES})
  -h, --help           Show this help
    `);
    return null;
  }
  return {
    batchTimeoutMinutes:
      values['batch-timeout'] === undefined
        ? DEFAULT_BATCH_TIMEOUT_MINUTES
        : Number.parseInt(values['batch-timeout'], 10),
    debug: Boolean(
      values.debug ||
        values['smoke-test'] ||
        values['debug-session'] !== undefined,
    ),
    debugSession: values['debug-session'] || null,
    dryRun: Boolean(values['dry-run']),
    limit:
      values.limit === undefined ? null : Number.parseInt(values.limit, 10),
    minDuration:
      values['min-duration'] === undefined
        ? MIN_ANALYSIS_CALL_DURATION_SECONDS
        : Number.parseInt(values['min-duration'], 10),
    models: (values.models ?? '')
      .split(',')
      .map((model) => model.trim())
      .filter(Boolean),
    realtime: Boolean(values.realtime || values['no-batch']),
    retryFailed: Boolean(values['retry-failed']),
    smokeTest: Boolean(values['smoke-test']),
  };
}

async function main() {
  const options = parseArgs();
  if (!options) {
    return;
  }
  loadScriptEnv();
  console.log('🚀 Backfill Call Analysis');
  console.log(`   Mode: ${options.dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`   Engine: ${options.realtime ? 'real-time' : 'Batch API'}`);
  console.log(
    `   Min duration: ${options.minDuration}s, limit: ${options.limit || 'none'}, models: ${
      options.models.length > 0 ? options.models.join(', ') : 'all'
    }`,
  );

  const supabase = createScriptAdminClient({ readOnly: options.dryRun });

  if (options.smokeTest) {
    console.log('\n🧪 xAI smoke test:', await runSmokeTest(createXaiClient()));
  }

  console.log('\n📥 Fetching completed sessions without an analysis row...');
  let sessions = await getAllCompletedCallSessions(supabase, {
    includeParked: options.retryFailed,
    minDuration: options.minDuration,
    models: options.models,
  });
  console.log(`   Found ${sessions.length} candidate sessions`);

  if (options.limit && sessions.length > options.limit) {
    sessions = sessions.slice(0, options.limit);
    console.log(`   Limited to ${sessions.length} (most recent)`);
  }

  if (sessions.length === 0) {
    console.log('\n✅ Nothing to backfill. Exiting.');
    return;
  }

  const allResults = await processSessionsInBatches(sessions, options);
  const insights = aggregateInsights(allResults);
  printSummaryReport(insights);

  if (options.dryRun) {
    console.log('\n⏭️ Dry run - writing CSV/insights, skipping DB');
    await saveResults(allResults, insights, 'call-analysis-backfill');
  } else {
    await persistResults(supabase, allResults, insights, { timeRangeHours: 0 });
  }

  console.log('\n✅ Backfill complete!');
}

runScript(import.meta.url, main);
