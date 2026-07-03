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
 *   - XAI_SUMMARY_MODEL (optional; defaults to grok-4.3)
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
const DEFAULT_MODEL = 'grok-4.3';

// xAI Batch API: async, discounted, no per-request rate limits. Default engine
// for both the recent cron and the backfill; --realtime opts back into the
// synchronous AI SDK path. See https://docs.x.ai/developers/advanced-api-usage/batch-api
// Base host only; request paths below include the /v1 prefix (matches the
// documented curl, e.g. https://api.x.ai/v1/files). Trailing slashes stripped
// so an override with or without one both resolve correctly.
const XAI_API_BASE = (
  process.env.XAI_API_BASE_URL || 'https://api.x.ai'
).replace(/\/+$/, '');
const BATCH_POLL_INTERVAL_MS = 5000; // xAI recommends 2-5s between status polls
export const DEFAULT_BATCH_TIMEOUT_MINUTES = 60;

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
  const options = {
    dryRun: false,
    hours: 24,
    limit: null,
    debug: false,
    debugSession: null,
    smokeTest: false,
    realtime: false,
    batchTimeoutMinutes: DEFAULT_BATCH_TIMEOUT_MINUTES,
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
        onConflict: 'session_id',
        ignoreDuplicates: true,
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
  return { successCount, errorCount, skippedCount };
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

  return [...normalizedAssistant, ...normalizedUser].sort(
    (a, b) => toEpoch(a.timestamp) - toEpoch(b.timestamp),
  );
}

// Parse a timestamp to epoch ms; missing/invalid values sort first (0).
function toEpoch(timestamp) {
  if (!timestamp) {
    return 0;
  }
  const parsed = Date.parse(timestamp);
  return Number.isNaN(parsed) ? 0 : parsed;
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
        // Treat an unparseable response as a failure (top-level error), not a
        // valid analysis: otherwise it would inflate success metrics and persist
        // an all-null row that blocks reprocessing.
        console.error(
          `❌ Failed to parse LLM response for session ${session.id}: ${parseError.message}`,
        );
        results.push({
          sessionId: session.id,
          userId: session.user_id,
          startedAt: session.started_at,
          durationSeconds: session.duration_seconds,
          endReason: session.end_reason,
          error: `parse failed: ${parseError.message}`,
        });
        continue;
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

async function processSessionsRealtime(xai, sessions, options) {
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

    const batchResults = await analyzeCallSessionsWithLLM(xai, batch, options);
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

const CHAT_COMPLETIONS_PATH = '/v1/chat/completions';

async function xaiApiFetch(path, init = {}) {
  if (!process.env.XAI_API_KEY) {
    throw new Error('Missing env.XAI_API_KEY');
  }
  const response = await fetch(`${XAI_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.XAI_API_KEY}`,
      ...(init.headers || {}),
    },
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(
      `xAI ${init.method || 'GET'} ${path} failed: ${response.status} ${response.statusText}${
        detail ? ` - ${detail}` : ''
      }`,
    );
  }
  return response.json();
}

// Upload the JSONL request file. Follows the documented curl (single `file`
// multipart field); FormData sets the multipart Content-Type + boundary.
async function uploadBatchInputFile(jsonl, filename) {
  const form = new FormData();
  form.append(
    'file',
    new Blob([jsonl], { type: 'application/jsonl' }),
    filename,
  );
  const data = await xaiApiFetch('/v1/files', { method: 'POST', body: form });
  const fileId = data.id || data.file_id || data.file?.id;
  if (!fileId) {
    throw new Error(`xAI file upload returned no id: ${JSON.stringify(data)}`);
  }
  return fileId;
}

async function createBatch(name, inputFileId) {
  const data = await xaiApiFetch('/v1/batches', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, input_file_id: inputFileId }),
  });
  const batchId = data.batch_id || data.id;
  if (!batchId) {
    throw new Error(
      `xAI batch creation returned no id: ${JSON.stringify(data)}`,
    );
  }
  return batchId;
}

async function getBatchState(batchId) {
  const batch = await xaiApiFetch(`/v1/batches/${batchId}`);
  return batch.state || batch || {};
}

async function getBatchResults(batchId) {
  const results = [];
  let paginationToken = null;
  do {
    const query = new URLSearchParams({ limit: '100' });
    if (paginationToken) {
      query.set('pagination_token', paginationToken);
    }
    const page = await xaiApiFetch(`/v1/batches/${batchId}/results?${query}`);
    if (Array.isArray(page.results)) {
      results.push(...page.results);
    }
    paginationToken = page.pagination_token || null;
  } while (paginationToken);
  return results;
}

async function pollBatchUntilDone(batchId, options = {}) {
  const timeoutMinutes =
    options.batchTimeoutMinutes ?? DEFAULT_BATCH_TIMEOUT_MINUTES;
  const timeoutMs = timeoutMinutes * 60_000;
  const startedAt = Date.now();
  let lastLine = '';

  for (;;) {
    const state = await getBatchState(batchId);
    const pending = state.num_pending ?? 0;
    const success = state.num_success ?? 0;
    const errors = state.num_error ?? 0;
    const cancelled = state.num_cancelled ?? 0;
    const total = state.num_requests ?? 0;
    const settled = success + errors + cancelled;

    const line = `   ⏳ batch ${batchId}: ${success} done, ${pending} pending${
      errors ? `, ${errors} errors` : ''
    }${cancelled ? `, ${cancelled} cancelled` : ''}`;
    if (line !== lastLine) {
      console.log(line);
      lastLine = line;
    }

    // Guard against the create->parse window where every counter is still 0:
    // only treat pending==0 as "done" once the batch has registered requests.
    const registered = total > 0 || settled > 0;
    if (registered && pending === 0) {
      return state;
    }

    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(
        `Batch ${batchId} did not finish within ${timeoutMinutes} minutes. ` +
          'Re-run later to retrieve results or inspect it in the xAI console.',
      );
    }

    await new Promise((resolve) => setTimeout(resolve, BATCH_POLL_INTERVAL_MS));
  }
}

// The docs show the result shape for the inline batch_requests style; the
// file-based /v1/chat/completions style may come back OpenAI-shaped. Probe both.
function extractBatchResultContent(result) {
  const customId = result.custom_id ?? result.batch_request_id ?? null;
  const errorMessage =
    result.error_message ||
    result.error?.message ||
    (typeof result.error === 'string' ? result.error : null) ||
    result.response?.body?.error?.message ||
    null;

  const response = result.response ?? result.batch_result?.response ?? {};
  const content =
    response.body?.choices?.[0]?.message?.content ??
    response.chat_get_completion?.choices?.[0]?.message?.content ??
    response.choices?.[0]?.message?.content ??
    null;

  return { customId, content, errorMessage };
}

// Build one JSONL request line for a session, or an error-result row when the
// transcript has no usable messages (mirrors the real-time path's early exit).
function prepareBatchRequest(session, model) {
  const base = {
    sessionId: session.id,
    userId: session.user_id,
    startedAt: session.started_at,
    durationSeconds: session.duration_seconds,
    endReason: session.end_reason,
  };

  const messages = extractMessages(session.transcript).map((msg) => ({
    ...msg,
    content: sanitizeMessageContent(msg.content),
  }));
  const stats = calculateConversationStats(messages);

  if (messages.length === 0) {
    return { errorResult: { ...base, error: 'No messages in transcript' } };
  }

  const conversationSummary = buildConversationSummary(messages);
  const assistantOnlyNote =
    stats.userMessageCount === 0
      ? 'No user transcription detected; analysis based on assistant transcript only.'
      : null;

  const line = JSON.stringify({
    custom_id: session.id,
    method: 'POST',
    url: CHAT_COMPLETIONS_PATH,
    body: {
      model,
      messages: [
        {
          role: 'user',
          content: buildPrompt(
            session,
            conversationSummary,
            stats,
            assistantOnlyNote,
          ),
        },
      ],
    },
  });

  return { line, ctx: { base, stats, assistantOnlyNote } };
}

// Turn a single batch outcome back into the shared result-row shape.
function batchOutcomeToResult(sessionId, ctx, outcome) {
  if (!outcome) {
    return { ...ctx.base, error: 'No batch result returned' };
  }
  if (outcome.errorMessage || !outcome.content) {
    return {
      ...ctx.base,
      error: outcome.errorMessage || 'Empty batch response',
    };
  }

  let analysis;
  try {
    analysis = parseLlmJson(outcome.content);
  } catch (parseError) {
    // Treat an unparseable response as a failure (not a valid analysis) so it
    // stays retryable and never persists an all-null row.
    console.error(
      `❌ Failed to parse batch response for session ${sessionId}: ${parseError.message}`,
    );
    return { ...ctx.base, error: `parse failed: ${parseError.message}` };
  }

  return {
    ...ctx.base,
    stats: ctx.stats,
    analysis: ctx.assistantOnlyNote
      ? {
          ...analysis,
          notable_patterns: analysis?.notable_patterns
            ? `${analysis.notable_patterns} ${ctx.assistantOnlyNote}`
            : ctx.assistantOnlyNote,
        }
      : analysis,
  };
}

export async function analyzeCallSessionsWithBatchApi(sessions, options = {}) {
  const model = getModelId();
  const targetSessions = options.debugSession
    ? sessions.filter((session) => session.id === options.debugSession)
    : sessions;

  const results = [];
  // sessionId -> context needed to turn a batch result back into a result row.
  const prepared = new Map();
  const lines = [];

  for (const session of targetSessions) {
    const { line, ctx, errorResult } = prepareBatchRequest(session, model);
    if (errorResult) {
      results.push(errorResult);
      continue;
    }
    prepared.set(session.id, ctx);
    lines.push(line);
  }

  if (lines.length === 0) {
    return results;
  }

  console.log(`   Uploading ${lines.length} requests to the xAI Batch API...`);
  const fileId = await uploadBatchInputFile(
    `${lines.join('\n')}\n`,
    'call-analysis-batch.jsonl',
  );
  const batchId = await createBatch(`call-analysis-${lines.length}`, fileId);
  console.log(`   Batch ${batchId} created; waiting for completion...`);

  await pollBatchUntilDone(batchId, options);
  const batchResults = await getBatchResults(batchId);
  console.log(`   Retrieved ${batchResults.length} batch results`);

  const byId = new Map();
  for (const raw of batchResults) {
    const parsed = extractBatchResultContent(raw);
    if (parsed.customId) {
      byId.set(parsed.customId, parsed);
    }
  }

  for (const [sessionId, ctx] of prepared) {
    results.push(batchOutcomeToResult(sessionId, ctx, byId.get(sessionId)));
  }

  return results;
}

export function processSessionsInBatches(xai, sessions, options = {}) {
  if (options.realtime) {
    return processSessionsRealtime(xai, sessions, options);
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
  console.log(`   Engine: ${options.realtime ? 'real-time' : 'Batch API'}`);
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
