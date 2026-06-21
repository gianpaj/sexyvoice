#!/usr/bin/env node

/**
 * Call Sessions Analysis Script (recent / daily cron)
 *
 * Analyzes recent call_sessions transcripts using xAI Grok via the AI SDK and
 * writes one rich row per call to `call_session_analysis`, plus an aggregate row
 * to `call_session_analytics`. Sessions that already have a call_session_analysis
 * row are skipped.
 *
 * Usage:
 *   node scripts/analyze-call-sessions.mjs [--dry-run] [--hours=24] [--limit=100] [--debug] [--debug-session=UUID] [--smoke-test]
 *
 * Environment variables required:
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 *   - XAI_API_KEY
 *   - XAI_SUMMARY_MODEL (optional; defaults to grok-4)
 *
 * Shared helpers are exported for scripts/backfill-call-analysis.mjs.
 */

import { fileURLToPath } from 'node:url';
import { createXai } from '@ai-sdk/xai';
import { createClient } from '@supabase/supabase-js';
import { generateText } from 'ai';
import { config } from 'dotenv';

config({
  path: [
    '.env',
    '.env.local',
    '../.env',
    '../.env.local',
    '../apps/web/.env',
    '../apps/web/.env.local',
  ],
  override: false,
});

// ============================================================================
// Configuration
// ============================================================================

export const BATCH_SIZE = 5; // calls per chunk (sequential LLM calls)
export const MIN_ANALYSIS_CALL_DURATION_SECONDS = 120; // 2 minutes
export const LONG_CALL_THRESHOLD_SECONDS = 180; // 3 minutes
const OUTPUT_FILE_PREFIX = 'call-analysis-results';
const DB_FETCH_PAGE_SIZE = 1000;
const DEFAULT_MODEL = 'grok-4';

// ============================================================================
// Clients
// ============================================================================

export function createAdminClient() {
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

export function createXaiClient() {
  if (!process.env.XAI_API_KEY) {
    throw new Error('Missing env.XAI_API_KEY');
  }
  return createXai({ apiKey: process.env.XAI_API_KEY });
}

export function getModelId() {
  return process.env.XAI_SUMMARY_MODEL || DEFAULT_MODEL;
}

// ============================================================================
// CLI
// ============================================================================

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    dryRun: false,
    hours: 24,
    limit: null,
    debug: false,
    debugSession: null,
    smokeTest: false,
  };

  for (const arg of args) {
    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg.startsWith('--hours=')) {
      options.hours = Number.parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--limit=')) {
      options.limit = Number.parseInt(arg.split('=')[1], 10);
    } else if (arg === '--debug') {
      options.debug = true;
    } else if (arg.startsWith('--debug-session=')) {
      options.debugSession = arg.split('=')[1] || null;
      options.debug = true;
    } else if (arg === '--smoke-test') {
      options.smokeTest = true;
      options.debug = true;
    } else if (arg === '--help' || arg === '-h') {
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
  -h, --help           Show this help
      `);
      process.exit(0);
    }
  }

  return options;
}

// ============================================================================
// Database queries
// ============================================================================

const SESSION_COLUMNS =
  'id, user_id, model, voice_id, started_at, ended_at, duration_seconds, status, end_reason, transcript, created_at';

/**
 * Remove sessions that already have a call_session_analysis row.
 */
export async function filterAnalyzedSessions(supabase, sessions) {
  if (sessions.length === 0) {
    return [];
  }

  const analyzed = new Set();
  const ids = sessions.map((s) => s.id);
  const CHUNK = 200;

  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from('call_session_analysis')
      .select('session_id')
      .in('session_id', slice);

    if (error) {
      throw new Error(`Error checking existing analyses: ${error.message}`);
    }

    for (const row of data || []) {
      analyzed.add(row.session_id);
    }
  }

  return sessions.filter((s) => !analyzed.has(s.id));
}

async function getRecentCallSessions(supabase, hoursAgo, limit = null) {
  const cutoffTime = new Date(
    Date.now() - hoursAgo * 60 * 60 * 1000,
  ).toISOString();

  let query = supabase
    .from('call_sessions')
    .select(SESSION_COLUMNS)
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

  return filterAnalyzedSessions(supabase, data || []);
}

/**
 * Fetch all completed call sessions with a transcript (paginated). Used by the
 * backfill script.
 */
export async function getAllCompletedCallSessions(supabase, options = {}) {
  const { minDuration = MIN_ANALYSIS_CALL_DURATION_SECONDS, models = [] } =
    options;
  const rows = [];
  let from = 0;

  while (true) {
    let query = supabase
      .from('call_sessions')
      .select(SESSION_COLUMNS)
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

  return filterAnalyzedSessions(supabase, rows);
}

function buildAnalysisRecord(result) {
  const analysis = result.analysis || {};
  return {
    session_id: result.sessionId,
    user_id: result.userId || null,
    started_at: result.startedAt || null,
    duration_seconds: result.durationSeconds || null,
    end_reason: result.endReason || null,
    language: analysis.language || null,
    topic_category: analysis.topic_category || null,
    topic_subcategory: analysis.topic_subcategory || null,
    engagement_level: analysis.user_engagement_level || null,
    conversation_quality: analysis.conversation_quality || null,
    where_died: analysis.where_conversation_died || null,
    user_sentiment: analysis.user_sentiment || null,
    key_requests: analysis.key_user_requests || [],
    ai_issues: analysis.ai_compliance_issues || null,
    notable_patterns: analysis.notable_patterns || null,
    error: result.error || null,
    analyzed_at: new Date().toISOString(),
  };
}

export async function saveAllSessionAnalyses(supabase, results) {
  let successCount = 0;
  let errorCount = 0;

  for (const result of results) {
    const { error } = await supabase
      .from('call_session_analysis')
      .insert(buildAnalysisRecord(result));
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
  if (errorCount > 0) {
    console.log(`   ❌ Failed to save ${errorCount} session analyses`);
  }
  return { successCount, errorCount };
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
// Transcript processing
// ============================================================================

function firstString(...values) {
  for (const value of values) {
    if (typeof value === 'string') return value;
  }
  return '';
}

export function extractMessages(transcript) {
  if (!transcript) return [];

  let assistantMessages = [];
  if (Array.isArray(transcript)) {
    assistantMessages = transcript;
  } else if (Array.isArray(transcript.messages)) {
    assistantMessages = transcript.messages;
  }

  const userTranscriptions = Array.isArray(transcript.user_transcriptions)
    ? transcript.user_transcriptions
    : [];

  const normalizedAssistant = assistantMessages
    .map((msg) => ({
      role: msg.role || 'assistant',
      content: firstString(msg.content, msg.text),
      timestamp: msg.timestamp || msg.created_at || msg.time || null,
    }))
    .filter((msg) => msg.content);

  const normalizedUser = userTranscriptions
    .map((msg) => ({
      role: 'user',
      content: firstString(msg.content, msg.text, msg.transcript),
      timestamp: msg.timestamp || msg.created_at || msg.time || null,
    }))
    .filter((msg) => msg.content);

  return [...normalizedAssistant, ...normalizedUser].sort((a, b) => {
    const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return timeA - timeB;
  });
}

export function calculateConversationStats(messages) {
  const userMessages = messages.filter((m) => m.role === 'user');
  const assistantMessages = messages.filter((m) => m.role === 'assistant');
  return {
    totalMessages: messages.length,
    userMessageCount: userMessages.length,
    assistantMessageCount: assistantMessages.length,
  };
}

export function buildConversationSummary(messages, maxLength = 4000) {
  let summary = '';
  for (const msg of messages) {
    const prefix = msg.role === 'user' ? 'USER: ' : 'AI: ';
    const line = `${prefix}${msg.content}\n`;
    if (summary.length + line.length > maxLength) {
      summary += '\n[... conversation truncated ...]';
      break;
    }
    summary += line;
  }
  return summary;
}

function sanitizeMessageContent(content) {
  return typeof content === 'string'
    ? content.replaceAll('\u0000', '').trim()
    : '';
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

function buildPrompt(session, conversationSummary, stats, assistantOnlyNote) {
  return `Analyze this AI voice call conversation and provide insights in JSON format.

CONVERSATION:
${conversationSummary}

CONTEXT:
- Call duration: ${session.duration_seconds} seconds
- End reason: ${session.end_reason || 'unknown'}
- Total messages: ${stats.totalMessages}
${assistantOnlyNote ? `- Note: ${assistantOnlyNote}` : ''}

Respond with ONLY valid JSON (no markdown, no code blocks) in this exact format:
{
  "language": "ISO 639-1 two-letter code of the primary language used by the USER when user transcriptions are available; otherwise infer from the overall conversation context and set notable_patterns to mention the missing user transcription",
  "topic_category": "One of: roleplay_intimate, roleplay_fantasy, casual_chat, emotional_support, asmr_relaxation, fetish_content, other",
  "topic_subcategory": "More specific topic description (e.g., 'daddy_dom', 'girlfriend_experience', 'meditation', etc.)",
  "user_engagement_level": "One of: high, medium, low, minimal",
  "conversation_quality": "One of: flowing, choppy, one_sided, dying",
  "where_conversation_died": "Brief description of what caused disengagement or null if conversation flowed well",
  "user_sentiment": "One of: satisfied, frustrated, bored, engaged, confused",
  "key_user_requests": ["List of main things the user asked for or wanted"],
  "ai_compliance_issues": "Any issues with AI responses (too loud, wrong tone, etc.) or null",
  "notable_patterns": "Any notable patterns or insights about this conversation, including whether user transcriptions were missing"
}`;
}

function parseLlmJson(responseText) {
  let cleaned = responseText.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }
  return JSON.parse(cleaned.trim());
}

export async function analyzeCallSessionsWithLLM(xai, sessions, options = {}) {
  const model = xai(getModelId());
  const results = [];

  for (const session of sessions) {
    if (options.debugSession && session.id !== options.debugSession) {
      continue;
    }

    try {
      const messages = extractMessages(session.transcript).map((msg) => ({
        ...msg,
        content: sanitizeMessageContent(msg.content),
      }));
      const stats = calculateConversationStats(messages);

      if (messages.length === 0) {
        results.push({
          sessionId: session.id,
          userId: session.user_id,
          startedAt: session.started_at,
          durationSeconds: session.duration_seconds,
          endReason: session.end_reason,
          error: 'No messages in transcript',
        });
        continue;
      }

      const conversationSummary = buildConversationSummary(messages);
      const assistantOnlyNote =
        stats.userMessageCount === 0
          ? 'No user transcription detected; analysis based on assistant transcript only.'
          : null;

      const { text: responseText } = await generateText({
        model,
        prompt: buildPrompt(
          session,
          conversationSummary,
          stats,
          assistantOnlyNote,
        ),
      });

      let analysis;
      try {
        analysis = parseLlmJson(responseText);
      } catch (parseError) {
        analysis = {
          raw_response: responseText,
          parse_error: parseError.message,
        };
      }

      results.push({
        sessionId: session.id,
        userId: session.user_id,
        startedAt: session.started_at,
        durationSeconds: session.duration_seconds,
        endReason: session.end_reason,
        stats,
        analysis: assistantOnlyNote
          ? {
              ...analysis,
              notable_patterns: analysis?.notable_patterns
                ? `${analysis.notable_patterns} ${assistantOnlyNote}`
                : assistantOnlyNote,
            }
          : analysis,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`❌ Error analyzing session ${session.id}: ${message}`);
      results.push({ sessionId: session.id, error: message });
    }
  }

  return results;
}

export async function processSessionsInBatches(xai, sessions, options) {
  console.log('\n🤖 Analyzing sessions with Grok via the AI SDK...');
  const allResults = [];

  for (let i = 0; i < sessions.length; i += BATCH_SIZE) {
    const batch = sessions.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(sessions.length / BATCH_SIZE);
    console.log(
      `   Processing batch ${batchNum}/${totalBatches} (${batch.length} sessions)...`,
    );

    const batchResults = await analyzeCallSessionsWithLLM(xai, batch, options);
    allResults.push(...batchResults);

    if (i + BATCH_SIZE < sessions.length) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  return allResults;
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
    .map(([request, count]) => ({ request, count }));

  return {
    totalAnalyzed: analysisResults.length,
    validAnalyses: validResults.length,
    errors: analysisResults.filter((r) => r.error).length,
    languageDistribution,
    topicDistribution,
    engagementLevels,
    popularTopics: Object.entries(topicDistribution)
      .sort(([, a], [, b]) => b - a)
      .map(([topic, count]) => ({ topic, count })),
    topUserRequests,
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
    time_range_hours: options.timeRangeHours ?? options.hours ?? 0,
    total_sessions_analyzed: allResults.length,
    insights,
  });
}

// ============================================================================
// Main (recent / daily-cron mode)
// ============================================================================

async function main() {
  const options = parseArgs();
  console.log('🚀 Call Sessions Analysis (recent)');
  console.log(`   Mode: ${options.dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(
    `   Time range: last ${options.hours}h, limit ${options.limit || 'none'}`,
  );

  const supabase = createAdminClient();
  const xai = createXaiClient();

  if (options.smokeTest) {
    console.log('\n🧪 xAI smoke test:', await runSmokeTest(xai));
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

  const allResults = await processSessionsInBatches(xai, sessions, options);
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
