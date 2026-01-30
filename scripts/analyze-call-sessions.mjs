/**
 * Call Sessions Analysis Script
 *
 * Analyzes call_sessions transcripts from the last 24 hours using Google Gemini LLM.
 * Extracts insights about conversation patterns, topics, languages, and user engagement.
 *
 * Usage:
 *   node scripts/analyze-call-sessions.mjs [--dry-run] [--hours=24] [--limit=100]
 *
 * Options:
 *   --dry-run   Run without updating the database
 *   --hours=N   Analyze calls from the last N hours (default: 24)
 *   --limit=N   Limit the number of calls to analyze (default: no limit)
 *
 * Environment variables required:
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 *   - GOOGLE_GENERATIVE_AI_API_KEY
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

// Load environment variables
config({ path: ['.env', '.env.local'] });

// ============================================================================
// Configuration
// ============================================================================

const BATCH_SIZE = 5; // Number of calls to analyze per LLM batch request
const LONG_CALL_THRESHOLD_SECONDS = 180; // 3 minutes
const OUTPUT_FILE_PREFIX = 'call-analysis-results';

// ============================================================================
// CLI Argument Parsing
// ============================================================================

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    dryRun: false,
    hours: 24,
    limit: null,
  };

  for (const arg of args) {
    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg.startsWith('--hours=')) {
      options.hours = Number.parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--limit=')) {
      options.limit = Number.parseInt(arg.split('=')[1], 10);
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Call Sessions Analysis Script

Analyzes call_sessions transcripts using Google Gemini LLM.

Usage:
  node scripts/analyze-call-sessions.mjs [options]

Options:
  --dry-run     Run without updating the database
  --hours=N     Analyze calls from the last N hours (default: 24)
  --limit=N     Limit the number of calls to analyze
  -h, --help    Show this help message

Environment variables:
  NEXT_PUBLIC_SUPABASE_URL         Supabase project URL
  SUPABASE_SERVICE_ROLE_KEY        Supabase service role key
  GOOGLE_GENERATIVE_AI_API_KEY     Google AI API key
      `);
      process.exit(0);
    }
  }

  return options;
}

// ============================================================================
// Supabase Client
// ============================================================================

function createAdminClient() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    throw new Error('Missing env.NEXT_PUBLIC_SUPABASE_URL');
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing env.SUPABASE_SERVICE_ROLE_KEY');
  }

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}

// ============================================================================
// Google Gemini Client
// ============================================================================

function createGeminiClient() {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    throw new Error('Missing env.GOOGLE_GENERATIVE_AI_API_KEY');
  }

  return new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY);
}

// ============================================================================
// Database Queries
// ============================================================================

/**
 * Fetch call sessions from the last N hours that haven't been analyzed yet
 */
async function getUnanalyzedCallSessions(supabase, hoursAgo, limit = null) {
  const cutoffTime = new Date(
    Date.now() - hoursAgo * 60 * 60 * 1000,
  ).toISOString();

  let query = supabase
    .from('call_sessions')
    .select(
      'id, user_id, model, voice_id, started_at, ended_at, duration_seconds, status, end_reason, transcript, metadata, created_at',
    )
    .gte('started_at', cutoffTime)
    .eq('status', 'completed')
    .not('transcript', 'is', null)
    .order('started_at', { ascending: false });

  // Filter out already analyzed sessions (metadata->analysed is not true)
  // Supabase doesn't support checking for missing keys easily, so we'll filter in code

  if (limit) {
    query = query.limit(limit);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Error fetching call sessions: ${error.message}`);
  }

  // Filter out sessions that have already been analyzed
  const unanalyzed = (data || []).filter((session) => {
    const metadata = session.metadata || {};
    return metadata.analysed !== true;
  });

  return unanalyzed;
}

/**
 * Update call session metadata to mark as analyzed
 */
async function markSessionAsAnalyzed(supabase, sessionId, analysisResult) {
  const { error } = await supabase
    .from('call_sessions')
    .update({
      metadata: supabase.sql`
        COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({
          analysed: true,
          analysed_at: new Date().toISOString(),
          analysis: analysisResult,
        })}::jsonb
      `,
    })
    .eq('id', sessionId);

  if (error) {
    // Fallback: fetch current metadata and merge
    const { data: currentSession } = await supabase
      .from('call_sessions')
      .select('metadata')
      .eq('id', sessionId)
      .single();

    const currentMetadata = currentSession?.metadata || {};
    const updatedMetadata = {
      ...currentMetadata,
      analysed: true,
      analysed_at: new Date().toISOString(),
      analysis: analysisResult,
    };

    const { error: updateError } = await supabase
      .from('call_sessions')
      .update({ metadata: updatedMetadata })
      .eq('id', sessionId);

    if (updateError) {
      throw new Error(
        `Error updating session ${sessionId}: ${updateError.message}`,
      );
    }
  }
}

/**
 * Save analysis results to call_session_analytics table
 */
async function saveAnalyticsRecord(supabase, analyticsData) {
  const { error } = await supabase
    .from('call_session_analytics')
    .insert(analyticsData);

  if (error) {
    // Table might not exist yet, log warning
    console.warn(
      `⚠️ Could not save to call_session_analytics table: ${error.message}`,
    );
    console.warn(
      '   You may need to create this table. See migration suggestion at the end.',
    );
    return false;
  }
  return true;
}

/**
 * Extract session metadata fields from result
 */
function extractSessionMetadata(result) {
  return {
    session_id: result.sessionId,
    user_id: result.userId || null,
    started_at: result.startedAt || null,
    duration_seconds: result.durationSeconds || null,
    end_reason: result.endReason || null,
  };
}

/**
 * Extract LLM analysis fields from result
 */
function extractAnalysisFields(analysis) {
  return {
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
  };
}

/**
 * Build analysis record from result object
 */
function buildAnalysisRecord(result) {
  const analysis = result.analysis || {};
  return {
    ...extractSessionMetadata(result),
    ...extractAnalysisFields(analysis),
    error: result.error || null,
    analyzed_at: new Date().toISOString(),
  };
}

/**
 * Save individual session analysis to call_session_analysis table
 */
async function saveSessionAnalysis(supabase, result) {
  const analysisRecord = buildAnalysisRecord(result);

  const { error } = await supabase
    .from('call_session_analysis')
    .insert(analysisRecord);

  if (error) {
    throw new Error(`Failed to save session analysis: ${error.message}`);
  }

  return true;
}

/**
 * Save all session analyses to the database in batch
 */
async function saveAllSessionAnalyses(supabase, results) {
  console.log(
    '\n📝 Saving individual session analyses to call_session_analysis table...',
  );
  let successCount = 0;
  let errorCount = 0;

  for (const result of results) {
    try {
      await saveSessionAnalysis(supabase, result);
      successCount += 1;
    } catch (error) {
      console.error(
        `   ❌ Failed to save analysis for session ${result.sessionId}: ${error.message}`,
      );
      errorCount += 1;
    }
  }

  console.log(`   ✅ Saved ${successCount} session analyses`);
  if (errorCount > 0) {
    console.log(`   ❌ Failed to save ${errorCount} session analyses`);
  }

  return { successCount, errorCount };
}

// ============================================================================
// Transcript Processing
// ============================================================================

/**
 * Extract messages from transcript JSON
 */
function extractMessages(transcript) {
  if (!transcript) return [];

  // Handle both direct messages array and nested structure
  const messages = transcript.messages || transcript;

  if (!Array.isArray(messages)) return [];

  return messages.map((msg) => ({
    role: msg.role,
    content: msg.content,
    timestamp: msg.timestamp,
  }));
}

/**
 * Calculate conversation statistics
 */
function calculateConversationStats(messages) {
  const userMessages = messages.filter((m) => m.role === 'user');
  const assistantMessages = messages.filter((m) => m.role === 'assistant');

  const userWordCount = userMessages.reduce(
    (sum, m) => sum + (m.content?.split(/\s+/).length || 0),
    0,
  );
  const assistantWordCount = assistantMessages.reduce(
    (sum, m) => sum + (m.content?.split(/\s+/).length || 0),
    0,
  );

  // Calculate average response time
  let totalResponseTime = 0;
  let responseCount = 0;

  for (let i = 1; i < messages.length; i++) {
    if (messages[i].role === 'assistant' && messages[i - 1].role === 'user') {
      const userTime = new Date(messages[i - 1].timestamp).getTime();
      const assistantTime = new Date(messages[i].timestamp).getTime();
      if (!(Number.isNaN(userTime) || Number.isNaN(assistantTime))) {
        totalResponseTime += assistantTime - userTime;
        responseCount += 1;
      }
    }
  }

  // Detect conversation gaps (>60 seconds between messages)
  const gaps = [];
  for (let i = 1; i < messages.length; i++) {
    const prevTime = new Date(messages[i - 1].timestamp).getTime();
    const currTime = new Date(messages[i].timestamp).getTime();
    const gapSeconds = (currTime - prevTime) / 1000;

    if (gapSeconds > 60) {
      gaps.push({
        afterMessageIndex: i - 1,
        gapSeconds,
        beforeContent: messages[i - 1].content?.substring(0, 100),
        afterContent: messages[i].content?.substring(0, 100),
      });
    }
  }

  // Get last few messages to understand where conversation ended
  const lastMessages = messages.slice(-5).map((m) => ({
    role: m.role,
    content: m.content?.substring(0, 200),
  }));

  return {
    totalMessages: messages.length,
    userMessageCount: userMessages.length,
    assistantMessageCount: assistantMessages.length,
    userWordCount,
    assistantWordCount,
    averageResponseTimeMs:
      responseCount > 0 ? totalResponseTime / responseCount : 0,
    conversationGaps: gaps,
    lastMessages,
  };
}

/**
 * Build a condensed conversation summary for LLM analysis
 */
function buildConversationSummary(messages, maxLength = 4000) {
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

// ============================================================================
// LLM Analysis
// ============================================================================

/**
 * Analyze a batch of call sessions using Gemini
 */
async function analyzeCallSessionsWithLLM(genAI, sessions) {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-lite' });

  const results = [];

  for (const session of sessions) {
    try {
      const messages = extractMessages(session.transcript);
      const conversationSummary = buildConversationSummary(messages);
      const stats = calculateConversationStats(messages);

      if (messages.length === 0) {
        results.push({
          sessionId: session.id,
          error: 'No messages in transcript',
          stats,
        });
        continue;
      }

      const prompt = `Analyze this AI voice call conversation and provide insights in JSON format.

CONVERSATION:
${conversationSummary}

CONTEXT:
- Call duration: ${session.duration_seconds} seconds
- End reason: ${session.end_reason || 'unknown'}
- Total messages: ${stats.totalMessages}

Respond with ONLY valid JSON (no markdown, no code blocks) in this exact format:
{
  "language": "ISO 639-1 two-letter code of the primary language used by the USER (e.g., 'en', 'es', 'de', 'fr')",
  "topic_category": "One of: roleplay_intimate, roleplay_fantasy, casual_chat, emotional_support, asmr_relaxation, fetish_content, other",
  "topic_subcategory": "More specific topic description (e.g., 'daddy_dom', 'girlfriend_experience', 'meditation', etc.)",
  "user_engagement_level": "One of: high, medium, low, minimal",
  "conversation_quality": "One of: flowing, choppy, one_sided, dying",
  "where_conversation_died": "Brief description of what caused disengagement or null if conversation flowed well",
  "user_sentiment": "One of: satisfied, frustrated, bored, engaged, confused",
  "key_user_requests": ["List of main things the user asked for or wanted"],
  "ai_compliance_issues": "Any issues with AI responses (too loud, wrong tone, etc.) or null",
  "notable_patterns": "Any notable patterns or insights about this conversation"
}`;

      const result = await model.generateContent(prompt);
      const responseText = result.response.text();

      // Parse JSON response
      let analysis;
      try {
        // Clean up response - remove markdown code blocks if present
        let cleanedResponse = responseText.trim();
        if (cleanedResponse.startsWith('```json')) {
          cleanedResponse = cleanedResponse.slice(7);
        } else if (cleanedResponse.startsWith('```')) {
          cleanedResponse = cleanedResponse.slice(3);
        }
        if (cleanedResponse.endsWith('```')) {
          cleanedResponse = cleanedResponse.slice(0, -3);
        }
        cleanedResponse = cleanedResponse.trim();

        analysis = JSON.parse(cleanedResponse);
      } catch (parseError) {
        console.warn(
          `⚠️ Failed to parse LLM response for session ${session.id}:`,
          responseText,
        );
        analysis = {
          raw_response: responseText,
          parse_error: parseError.message,
        };
      }

      results.push({
        sessionId: session.id,
        userId: session.user_id,
        startedAt: session.started_at,
        endedAt: session.ended_at,
        durationSeconds: session.duration_seconds,
        endReason: session.end_reason,
        model: session.model,
        voiceId: session.voice_id,
        stats,
        analysis,
      });
    } catch (error) {
      console.error(`❌ Error analyzing session ${session.id}:`, error.message);
      results.push({
        sessionId: session.id,
        error: error.message,
      });
    }
  }

  return results;
}

// ============================================================================
// Aggregation & Insights
// ============================================================================

/**
 * Aggregate analysis results to answer key questions
 */
/**
 * Count occurrences in a distribution object
 */
function incrementCount(distribution, key) {
  distribution[key] = (distribution[key] || 0) + 1;
}

/**
 * Aggregate analysis results to answer key questions
 */
function aggregateInsights(analysisResults) {
  const validResults = analysisResults.filter((r) => r.analysis && !r.error);

  if (validResults.length === 0) {
    return {
      totalAnalyzed: analysisResults.length,
      validAnalyses: 0,
      errors: analysisResults.filter((r) => r.error).length,
    };
  }

  // Language distribution
  const languageDistribution = {};
  for (const r of validResults) {
    const lang = r.analysis.language || 'unknown';
    incrementCount(languageDistribution, lang);
  }

  // Topic distribution
  const topicDistribution = {};
  const subtopicDistribution = {};
  for (const r of validResults) {
    const topic = r.analysis.topic_category || 'unknown';
    const subtopic = r.analysis.topic_subcategory || 'unknown';
    incrementCount(topicDistribution, topic);
    incrementCount(subtopicDistribution, subtopic);
  }

  // Engagement levels
  const engagementLevels = {};
  for (const r of validResults) {
    const level = r.analysis.user_engagement_level || 'unknown';
    incrementCount(engagementLevels, level);
  }

  // Where conversations die
  const deathReasons = validResults
    .filter((r) => r.analysis.where_conversation_died)
    .map((r) => ({
      sessionId: r.sessionId,
      reason: r.analysis.where_conversation_died,
      durationSeconds: r.durationSeconds,
    }));

  // AI compliance issues
  const complianceIssues = validResults
    .filter((r) => r.analysis.ai_compliance_issues)
    .map((r) => ({
      sessionId: r.sessionId,
      issue: r.analysis.ai_compliance_issues,
    }));

  // Time of day analysis (for calls > 3 minutes)
  const longCalls = validResults.filter(
    (r) => r.durationSeconds >= LONG_CALL_THRESHOLD_SECONDS,
  );
  const hourlyDistribution = {};
  for (const r of longCalls) {
    const hour = new Date(r.startedAt).getUTCHours();
    incrementCount(hourlyDistribution, hour);
  }

  // Find peak hours
  const peakHours = Object.entries(hourlyDistribution)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([hour, count]) => ({ hour: Number.parseInt(hour, 10), count }));

  // Duration distribution
  const shortCalls = validResults.filter((r) => r.durationSeconds < 60);
  const mediumCalls = validResults.filter(
    (r) =>
      r.durationSeconds >= 60 &&
      r.durationSeconds < LONG_CALL_THRESHOLD_SECONDS,
  );

  // User requests aggregation
  const allRequests = validResults
    .filter((r) => r.analysis.key_user_requests)
    .flatMap((r) => r.analysis.key_user_requests);
  const requestFrequency = {};
  for (const req of allRequests) {
    const normalized = req.toLowerCase().trim();
    incrementCount(requestFrequency, normalized);
  }
  const topRequests = Object.entries(requestFrequency)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10);

  return {
    totalAnalyzed: analysisResults.length,
    validAnalyses: validResults.length,
    errors: analysisResults.filter((r) => r.error).length,

    languageDistribution,
    topicDistribution,
    subtopicDistribution,
    engagementLevels,

    conversationDeathAnalysis: {
      totalConversationsDied: deathReasons.length,
      reasons: deathReasons.slice(0, 20), // Top 20 examples
    },

    aiComplianceIssues: {
      total: complianceIssues.length,
      issues: complianceIssues.slice(0, 10),
    },

    durationAnalysis: {
      shortCalls: shortCalls.length,
      mediumCalls: mediumCalls.length,
      longCalls: longCalls.length,
      averageDuration:
        validResults.reduce((sum, r) => sum + r.durationSeconds, 0) /
        validResults.length,
    },

    timeOfDayAnalysis: {
      hourlyDistribution,
      peakHours,
      totalLongCalls: longCalls.length,
    },

    popularTopics: Object.entries(topicDistribution)
      .sort(([, a], [, b]) => b - a)
      .map(([topic, count]) => ({ topic, count })),

    leastPopularTopics: Object.entries(topicDistribution)
      .sort(([, a], [, b]) => a - b)
      .slice(0, 3)
      .map(([topic, count]) => ({ topic, count })),

    topUserRequests: topRequests.map(([request, count]) => ({
      request,
      count,
    })),
  };
}

// ============================================================================
// Output
// ============================================================================

/**
 * Save results to CSV file
 */
async function saveResultsToCSV(results, filename) {
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

/**
 * Print language distribution
 */
function printLanguageDistribution(insights) {
  console.log('\n🌍 Language Distribution:');
  const sortedLangs = Object.entries(insights.languageDistribution).sort(
    ([, a], [, b]) => b - a,
  );
  for (const [lang, count] of sortedLangs) {
    const pct = ((count / insights.validAnalyses) * 100).toFixed(1);
    console.log(`   ${lang}: ${count} (${pct}%)`);
  }
}

/**
 * Print topic and engagement info
 */
function printTopicsAndEngagement(insights) {
  console.log('\n📁 Topic Categories (Most Popular → Least Popular):');
  for (const { topic, count } of insights.popularTopics) {
    const pct = ((count / insights.validAnalyses) * 100).toFixed(1);
    console.log(`   ${topic}: ${count} (${pct}%)`);
  }

  console.log('\n⚡ Engagement Levels:');
  const sortedLevels = Object.entries(insights.engagementLevels).sort(
    ([, a], [, b]) => b - a,
  );
  for (const [level, count] of sortedLevels) {
    const pct = ((count / insights.validAnalyses) * 100).toFixed(1);
    console.log(`   ${level}: ${count} (${pct}%)`);
  }
}

/**
 * Print duration and time analysis
 */
function printDurationAnalysis(insights) {
  console.log('\n⏱️ Call Duration Analysis:');
  console.log(`   Short (<1 min): ${insights.durationAnalysis.shortCalls}`);
  console.log(`   Medium (1-3 min): ${insights.durationAnalysis.mediumCalls}`);
  console.log(`   Long (>3 min): ${insights.durationAnalysis.longCalls}`);
  const avgDuration = Math.round(insights.durationAnalysis.averageDuration);
  console.log(`   Average duration: ${avgDuration}s`);

  console.log('\n🕐 Peak Hours for Long Calls (>3 min) [UTC]:');
  for (const { hour, count } of insights.timeOfDayAnalysis.peakHours) {
    console.log(`   ${String(hour).padStart(2, '0')}:00 UTC: ${count} calls`);
  }
}

/**
 * Print conversation death analysis
 */
function printDeathAnalysis(insights) {
  const totalDied = insights.conversationDeathAnalysis.totalConversationsDied;
  console.log(`\n💀 Where Conversations Die (${totalDied} cases):`);

  const deathReasonSummary = {};
  for (const { reason } of insights.conversationDeathAnalysis.reasons) {
    const key = reason.toLowerCase().substring(0, 50);
    incrementCount(deathReasonSummary, key);
  }

  const sortedReasons = Object.entries(deathReasonSummary)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);
  for (const [reason, count] of sortedReasons) {
    console.log(`   "${reason}...": ${count}`);
  }
}

/**
 * Print summary report to console
 */
function printSummaryReport(insights) {
  console.log(`\n${'═'.repeat(70)}`);
  console.log('📊 CALL SESSIONS ANALYSIS REPORT');
  console.log('═'.repeat(70));

  console.log('\n📈 Overview:');
  console.log(`   Total calls analyzed: ${insights.totalAnalyzed}`);
  console.log(`   Successful analyses: ${insights.validAnalyses}`);
  console.log(`   Errors: ${insights.errors}`);

  if (insights.validAnalyses === 0) {
    console.log('\n⚠️ No valid analyses to report on.');
    return;
  }

  printLanguageDistribution(insights);
  printTopicsAndEngagement(insights);
  printDurationAnalysis(insights);
  printDeathAnalysis(insights);

  if (insights.aiComplianceIssues.total > 0) {
    const issueCount = insights.aiComplianceIssues.total;
    console.log(`\n⚠️ AI Compliance Issues (${issueCount} cases):`);
    for (const { issue } of insights.aiComplianceIssues.issues.slice(0, 5)) {
      console.log(`   - ${issue}`);
    }
  }

  console.log('\n🔝 Top User Requests:');
  for (const { request, count } of insights.topUserRequests.slice(0, 10)) {
    console.log(`   "${request}": ${count}`);
  }

  console.log(`\n${'═'.repeat(70)}`);
}

// ============================================================================
// Main Helper Functions
// ============================================================================

function printStartupInfo(options) {
  console.log('🚀 Call Sessions Analysis Script');
  console.log('━'.repeat(50));
  const modeText = options.dryRun ? 'DRY RUN (no DB updates)' : 'LIVE';
  console.log(`   Mode: ${modeText}`);
  console.log(`   Time range: Last ${options.hours} hours`);
  console.log(`   Limit: ${options.limit || 'No limit'}`);
  console.log('━'.repeat(50));

  if (process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('127.0.0.1')) {
    console.warn('⚠️ Using local Supabase URL');
  } else {
    console.log('🌐 Using production Supabase URL');
  }
}

async function processSessionsInBatches(genAI, sessions) {
  console.log('\n🤖 Analyzing sessions with Gemini LLM...');
  const allResults = [];

  for (let i = 0; i < sessions.length; i += BATCH_SIZE) {
    const batch = sessions.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(sessions.length / BATCH_SIZE);
    console.log(
      `   Processing batch ${batchNum}/${totalBatches} (${batch.length} sessions)...`,
    );

    const batchResults = await analyzeCallSessionsWithLLM(genAI, batch);
    allResults.push(...batchResults);

    // Small delay between batches to avoid rate limiting
    if (i + BATCH_SIZE < sessions.length) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  return allResults;
}

async function saveResults(allResults, insights) {
  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .substring(0, 19);
  const csvFilename = `${OUTPUT_FILE_PREFIX}-${timestamp}.csv`;
  await saveResultsToCSV(allResults, csvFilename);

  const { writeFile } = await import('node:fs/promises');
  const jsonFilename = `${OUTPUT_FILE_PREFIX}-${timestamp}-insights.json`;
  await writeFile(jsonFilename, JSON.stringify(insights, null, 2));
  console.log(`📄 Insights saved to: ${jsonFilename}`);
}

async function updateDatabase(supabase, allResults, options, insights) {
  // Save individual session analyses to call_session_analysis table
  await saveAllSessionAnalyses(supabase, allResults);

  // Mark original call_sessions as analyzed
  console.log('\n💾 Marking call_sessions as analyzed...');
  let successCount = 0;
  let errorCount = 0;

  for (const result of allResults) {
    try {
      await markSessionAsAnalyzed(
        supabase,
        result.sessionId,
        result.analysis || { error: result.error },
      );
      successCount += 1;
    } catch (error) {
      console.error(
        `   ❌ Failed to update session ${result.sessionId}: ${error.message}`,
      );
      errorCount += 1;
    }
  }

  console.log(`   ✅ Updated ${successCount} sessions`);
  if (errorCount > 0) {
    console.log(`   ❌ Failed to update ${errorCount} sessions`);
  }

  // Save aggregated analytics record
  console.log(
    '\n📊 Saving aggregated insights to call_session_analytics table...',
  );
  const analyticsRecord = {
    analysis_date: new Date().toISOString(),
    time_range_hours: options.hours,
    total_sessions_analyzed: allResults.length,
    insights,
  };
  const saved = await saveAnalyticsRecord(supabase, analyticsRecord);
  if (saved) {
    console.log('   ✅ Aggregated analytics record saved');
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const options = parseArgs();
  printStartupInfo(options);

  // Initialize clients
  const supabase = createAdminClient();
  const genAI = createGeminiClient();

  // Fetch unanalyzed call sessions
  console.log('\n📥 Fetching unanalyzed call sessions...');
  const sessions = await getUnanalyzedCallSessions(
    supabase,
    options.hours,
    options.limit,
  );
  console.log(`   Found ${sessions.length} unanalyzed sessions`);

  if (sessions.length === 0) {
    console.log('\n✅ No new sessions to analyze. Exiting.');
    return;
  }

  // Analyze sessions in batches
  const allResults = await processSessionsInBatches(genAI, sessions);

  // Aggregate insights
  console.log('\n📊 Aggregating insights...');
  const insights = aggregateInsights(allResults);

  // Print summary report
  printSummaryReport(insights);

  // Save results to files and database (if not dry run)
  if (options.dryRun) {
    console.log('\n⏭️ Dry run - skipping file and database updates');
  } else {
    await saveResults(allResults, insights);
    await updateDatabase(supabase, allResults, options, insights);
  }

  console.log('\n✅ Analysis complete!');
}

// Run
main().catch((error) => {
  console.error('❌ Script failed:', error);
  process.exit(1);
});
