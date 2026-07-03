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
 *   --debug              Verbose logging
 *   --debug-session=UUID Only analyze a specific session id
 *   --smoke-test         Run a tiny xAI request first to validate the model id
 *   -h, --help           Show this help
 *
 * Environment variables required:
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 *   - XAI_API_KEY
 *   - XAI_SUMMARY_MODEL (optional; defaults to grok-4.3)
 */

import {
  aggregateInsights,
  createAdminClient,
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

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    dryRun: false,
    limit: null,
    minDuration: MIN_ANALYSIS_CALL_DURATION_SECONDS,
    models: [],
    debug: false,
    debugSession: null,
    smokeTest: false,
    realtime: false,
    batchTimeoutMinutes: DEFAULT_BATCH_TIMEOUT_MINUTES,
  };

  for (const arg of args) {
    const [key, ...rest] = arg.split('=');
    const value = rest.join('=');
    switch (key) {
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--limit':
        options.limit = Number.parseInt(value, 10);
        break;
      case '--min-duration':
        options.minDuration = Number.parseInt(value, 10);
        break;
      case '--models':
        options.models = value
          .split(',')
          .map((m) => m.trim())
          .filter(Boolean);
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
Backfill Call Analysis Script

Usage:
  node scripts/backfill-call-analysis.mjs [options]

Options:
  --dry-run            Run without writing to the database (writes CSV + insights)
  --limit=N            Only analyze the N most recent candidates
  --min-duration=N     Minimum call duration in seconds (default: ${MIN_ANALYSIS_CALL_DURATION_SECONDS})
  --models=a,b,c       Only analyze these call models
  --debug              Verbose logging
  --debug-session=UUID Only analyze a specific session id
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

async function main() {
  const options = parseArgs();
  console.log('🚀 Backfill Call Analysis');
  console.log(`   Mode: ${options.dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`   Engine: ${options.realtime ? 'real-time' : 'Batch API'}`);
  console.log(
    `   Min duration: ${options.minDuration}s, limit: ${options.limit || 'none'}, models: ${
      options.models.length > 0 ? options.models.join(', ') : 'all'
    }`,
  );

  const supabase = createAdminClient();
  const xai = createXaiClient();

  if (options.smokeTest) {
    console.log('\n🧪 xAI smoke test:', await runSmokeTest(xai));
  }

  console.log('\n📥 Fetching completed sessions without an analysis row...');
  let sessions = await getAllCompletedCallSessions(supabase, {
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

  const allResults = await processSessionsInBatches(xai, sessions, options);
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

main().catch((error) => {
  console.error('❌ Backfill failed:', error);
  process.exit(1);
});
