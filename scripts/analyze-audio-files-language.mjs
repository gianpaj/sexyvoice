#!/usr/bin/env node

/**
 * Audio Files Language Analysis Script
 *
 * Detects the language of generated `audio_files.text_content` using
 * the Gemini batch API and is currently prepared to update
 * `audio_files.metadata.detectedLang` once that column exists.
 *
 * Selection criteria:
 * - only audio files from the last N days (default: 30)
 * - only audio files created by paid users by default, with optional inclusion of free users
 * - only specific models when provided
 * - only rows with `credits_used` greater than or equal to a provided threshold
 * - only rows that have non-empty text_content
 * - metadata-based skipping is temporarily disabled until the `metadata` column exists
 *
 * Usage:
 *   node scripts/analyze-audio-files-language.mjs [options]
 *
 * Options:
 *   --dry-run                    Run analysis without updating the database
 *   --days=N                     Analyze audio files from the last N days
 *   --days N                     Same as above
 *   --limit=N                    Limit number of audio files to analyze
 *   --limit N                    Same as above
 *   --models=a,b,c               Only analyze these models
 *   --models a,b,c               Same as above
 *   --min-credits-used=N         Only analyze rows with credits_used >= N
 *   --min-credits-used N         Same as above
 *   --include-free-users         Include audio files from free users too
 *   --force                      Re-analyze rows that already have metadata.detectedLang
 *   --debug                      Enable verbose logging
 *   --smoke-test                 Run a tiny Gemini request before processing rows
 *   --batch-model=MODEL          Override Gemini batch model
 *   --batch-model MODEL          Same as above
 *   -h, --help                   Show help
 *
 * Environment variables required:
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 *   - GOOGLE_GENERATIVE_AI_API_KEY
 *
 * Notes:
 * - Metadata writes are temporarily disabled until `audio_files.metadata` exists.
 * - It uses the Gemini batch API so large runs are cheaper and more scalable.
 */

import { writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({
  path: ['.env', '.env.local', '../.env', '../.env.local'],
  override: false,
});

const DEFAULT_BATCH_MODEL = 'gemini-2.5-flash';
const OUTPUT_FILE_PREFIX = 'audio-files-language-analysis-results';
const DB_FETCH_PAGE_SIZE = 500;
const MAX_TEXT_CHARS = 4000;
const MIN_TEXT_CHARS = 2;
const DEFAULT_BATCH_POLL_INTERVAL_MS = 4000;
const DEFAULT_BATCH_TIMEOUT_MS = 10 * 60 * 1000;
const INLINE_BATCH_REQUEST_LIMIT = 1000;

function createDefaultOptions() {
  return {
    dryRun: false,
    days: 30,
    limit: null,
    models: [],
    minCreditsUsed: null,
    includeFreeUsers: false,
    force: false,
    debug: false,
    smokeTest: false,
    batchModel: DEFAULT_BATCH_MODEL,
  };
}

function printHelp() {
  console.log(`
Audio Files Language Analysis Script

Detects the language of audio_files.text_content using the Gemini batch API and
updates audio_files.metadata.detectedLang with an ISO locale string.

Usage:
  node scripts/analyze-audio-files-language.mjs [options]

Options:
  --dry-run                    Run analysis without updating the database
  --days=N                     Analyze audio files from the last N days
  --days N                     Same as above
  --limit=N                    Limit number of audio files to analyze
  --limit N                    Same as above
  --models=a,b,c               Only analyze these models
  --models a,b,c               Same as above
  --min-credits-used=N         Only analyze rows with credits_used >= N
  --min-credits-used N         Same as above
  --include-free-users         Include audio files from free users too
  --force                      Reserved for future metadata-based re-analysis
  --debug                      Enable verbose logging
  --smoke-test                 Run a tiny Gemini request before processing rows
  --batch-model=MODEL          Override Gemini batch model
  --batch-model MODEL          Same as above
  -h, --help                   Show this help message

Examples:
  node scripts/analyze-audio-files-language.mjs --dry-run
  node scripts/analyze-audio-files-language.mjs --models=gemini-2.5-pro-preview-tts
  node scripts/analyze-audio-files-language.mjs --models gemini-2.5-pro-preview-tts,resemble-ai/chatterbox-multilingual --days 30 --limit 200
  node scripts/analyze-audio-files-language.mjs --min-credits-used=20
  node scripts/analyze-audio-files-language.mjs --models=gemini-2.5-pro-preview-tts --min-credits-used=2000 --days=15
  node scripts/analyze-audio-files-language.mjs --include-free-users --days=15

Environment variables:
  NEXT_PUBLIC_SUPABASE_URL         Supabase project URL
  SUPABASE_SERVICE_ROLE_KEY        Supabase service role key
  GOOGLE_GENERATIVE_AI_API_KEY     Gemini API key
      `);
}

function parseModelsArg(rawValue) {
  return String(rawValue)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function parseIntArgValue(optionName, rawValue, { min = null } = {}) {
  const parsed = Number.parseInt(String(rawValue), 10);

  if (!Number.isFinite(parsed)) {
    throw new Error(`${optionName} must be an integer`);
  }

  if (min !== null && parsed < min) {
    throw new Error(`${optionName} must be >= ${min}`);
  }

  return parsed;
}

function getNextArgValue(args, index, optionName) {
  const value = args[index + 1];
  if (value === undefined || value.startsWith('-')) {
    throw new Error(`Missing value for ${optionName}`);
  }
  return value;
}

function applyArg(options, args, index) {
  const arg = args[index];

  if (arg === '--dry-run') {
    options.dryRun = true;
    return index;
  }

  if (arg === '--include-free-users') {
    options.includeFreeUsers = true;
    return index;
  }

  if (arg === '--force') {
    options.force = true;
    return index;
  }

  if (arg === '--debug') {
    options.debug = true;
    return index;
  }

  if (arg === '--smoke-test') {
    options.smokeTest = true;
    options.debug = true;
    return index;
  }

  if (arg === '--help' || arg === '-h') {
    printHelp();
    process.exit(0);
  }

  if (arg.startsWith('--days=')) {
    options.days = parseIntArgValue('--days', arg.split('=')[1], { min: 1 });
    return index;
  }

  if (arg === '--days') {
    options.days = parseIntArgValue(
      '--days',
      getNextArgValue(args, index, '--days'),
      { min: 1 },
    );
    return index + 1;
  }

  if (arg.startsWith('--limit=')) {
    options.limit = parseIntArgValue('--limit', arg.split('=')[1], { min: 1 });
    return index;
  }

  if (arg === '--limit') {
    options.limit = parseIntArgValue(
      '--limit',
      getNextArgValue(args, index, '--limit'),
      { min: 1 },
    );
    return index + 1;
  }

  if (arg.startsWith('--models=')) {
    options.models = parseModelsArg(arg.split('=')[1]);
    return index;
  }

  if (arg === '--models') {
    options.models = parseModelsArg(getNextArgValue(args, index, '--models'));
    return index + 1;
  }

  if (arg.startsWith('--min-credits-used=')) {
    options.minCreditsUsed = parseIntArgValue(
      '--min-credits-used',
      arg.split('=')[1],
      { min: 0 },
    );
    return index;
  }

  if (arg === '--min-credits-used') {
    options.minCreditsUsed = parseIntArgValue(
      '--min-credits-used',
      getNextArgValue(args, index, '--min-credits-used'),
      { min: 0 },
    );
    return index + 1;
  }

  if (arg.startsWith('--batch-model=')) {
    options.batchModel = String(arg.split('=')[1]).trim();
    return index;
  }

  if (arg === '--batch-model') {
    options.batchModel = String(
      getNextArgValue(args, index, '--batch-model'),
    ).trim();
    return index + 1;
  }

  throw new Error(`Unknown argument: ${arg}`);
}

function validateOptions(options) {
  if (!Number.isFinite(options.days) || options.days <= 0) {
    throw new Error('--days must be a positive integer');
  }

  if (
    options.limit !== null &&
    (!Number.isFinite(options.limit) || options.limit <= 0)
  ) {
    throw new Error('--limit must be a positive integer');
  }

  if (
    options.minCreditsUsed !== null &&
    (!Number.isFinite(options.minCreditsUsed) || options.minCreditsUsed < 0)
  ) {
    throw new Error('--min-credits-used must be a non-negative integer');
  }

  if (!options.batchModel) {
    throw new Error('--batch-model must not be empty');
  }
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = createDefaultOptions();

  for (let index = 0; index < args.length; index += 1) {
    index = applyArg(options, args, index);
  }

  validateOptions(options);

  return options;
}

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

function createGeminiClient() {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    throw new Error('Missing env.GOOGLE_GENERATIVE_AI_API_KEY');
  }

  return new GoogleGenAI({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  });
}

function chunk(array, size) {
  const result = [];
  for (let index = 0; index < array.length; index += size) {
    result.push(array.slice(index, index + size));
  }
  return result;
}

function stripConfiguredStylePromptVariant(value) {
  const moanVariant = process.env.NEXT_PUBLIC_STYLE_PROMPT_VARIANT_MOAN;

  if (!moanVariant?.trim()) {
    return String(value || '');
  }

  return String(value || '')
    .split(moanVariant)
    .join('');
}

function truncateText(value, maxChars = MAX_TEXT_CHARS) {
  const normalized = stripConfiguredStylePromptVariant(value)
    .replace(/\s+/g, ' ')
    .trim();

  return normalized.length <= maxChars
    ? normalized
    : `${normalized.slice(0, maxChars)}…`;
}

function sanitizeLocaleCode(value) {
  if (typeof value !== 'string') return null;

  const normalized = value.trim().toLowerCase().replace(/_/g, '-');

  if (!normalized) return null;

  if (/^[a-z]{2,3}(-[a-z0-9]{2,8}){0,2}$/.test(normalized)) {
    return normalized;
  }

  return null;
}

function timestampForFilename() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

/*
function getMetadataObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value;
}
*/

async function runSmokeTest(ai, model) {
  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: 'Reply with exactly this plain text and nothing else: healthy',
          },
        ],
      },
    ],
  });

  return extractResponseText(response).trim();
}

/**
 * Paid user logic equivalent to:
 * credit_transactions.type in ('purchase', 'topup')
 */
async function getPaidUserIds(supabase, userIds) {
  if (userIds.length === 0) {
    return new Set();
  }

  const paidUserIds = new Set();
  const userIdChunks = chunk(userIds, 500);

  for (const userIdChunk of userIdChunks) {
    const { data, error } = await supabase
      .from('credit_transactions')
      .select('user_id')
      .in('user_id', userIdChunk)
      .in('type', ['purchase', 'topup']);

    if (error) {
      throw new Error(`Error fetching paid user ids: ${error.message}`);
    }

    for (const row of data || []) {
      if (row.user_id) {
        paidUserIds.add(row.user_id);
      }
    }
  }

  return paidUserIds;
}

async function getCandidateAudioFiles(supabase, options) {
  const cutoffDate = new Date(
    Date.now() - options.days * 24 * 60 * 60 * 1000,
  ).toISOString();

  const rows = [];
  let from = 0;

  while (true) {
    let query = supabase
      .from('audio_files')
      .select(
        'id, user_id, model, voice_id, created_at, text_content, url, storage_key, credits_used',
      )
      .gte('created_at', cutoffDate)
      .not('text_content', 'is', null)
      .order('created_at', { ascending: false })
      .range(from, from + DB_FETCH_PAGE_SIZE - 1);

    if (options.models.length > 0) {
      query = query.in('model', options.models);
    }

    if (options.minCreditsUsed !== null) {
      query = query.gte('credits_used', options.minCreditsUsed);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Error fetching audio_files: ${error.message}`);
    }

    if (!data || data.length === 0) {
      break;
    }

    rows.push(...data);

    if (options.debug) {
      console.log(
        `Fetched ${data.length} audio_files rows (total so far: ${rows.length})`,
      );
    }

    if (data.length < DB_FETCH_PAGE_SIZE) {
      break;
    }

    if (options.limit !== null && rows.length >= options.limit * 3) {
      break;
    }

    from += DB_FETCH_PAGE_SIZE;
  }

  const filteredByText = rows.filter((row) => {
    const text = String(row.text_content || '').trim();
    return text.length >= MIN_TEXT_CHARS;
  });

  const uniqueUserIds = [...new Set(filteredByText.map((row) => row.user_id))];
  const paidUserIds = options.includeFreeUsers
    ? null
    : await getPaidUserIds(supabase, uniqueUserIds);

  const filtered = filteredByText.filter((row) => {
    if (paidUserIds && !paidUserIds.has(row.user_id)) {
      return false;
    }

    return true;
  });

  if (options.limit !== null) {
    return filtered.slice(0, options.limit);
  }

  return filtered;
}

function buildSingleRequestPrompt(row) {
  const text = truncateText(row.text_content);

  return `You are classifying the natural language of generated text that was used to create an audio file.

Task:
- Detect the primary language of text_content.
- Return valid JSON only.
- The JSON object must have exactly these keys:
  - "id": exact input id
  - "detectedLang": ISO locale string, preferably ISO 639-1 when possible (examples: "en", "es", "de", "fr", "it", "pt-br", "zh-cn")
  - "confidence": number from 0 to 1
  - "reason": short explanation

Rules:
- Detect the language of the text itself, not the model name.
- If the text is mixed-language, return the dominant language.
- If the text is too short or ambiguous, still provide your best guess.
- Do not wrap the JSON in markdown.
- Output valid JSON only.

INPUT:
id: ${row.id}
model: ${row.model ?? 'unknown'}
created_at: ${row.created_at ?? 'unknown'}
credits_used: ${row.credits_used ?? 'unknown'}
text_content:
${text}`;
}

function buildBatchRequests(rows) {
  return rows.map((row) => ({
    contents: [
      {
        role: 'user',
        parts: [{ text: buildSingleRequestPrompt(row) }],
      },
    ],
    config: {
      temperature: 0.1,
      responseMimeType: 'application/json',
    },
    metadata: {
      key: row.id,
    },
  }));
}

function stripMarkdownFences(rawText) {
  let cleaned = String(rawText || '').trim();

  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }

  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }

  return cleaned.trim();
}

function extractResponseText(response) {
  if (typeof response?.text === 'string') {
    return response.text;
  }

  if (typeof response?.output_text === 'string') {
    return response.output_text;
  }

  if (typeof response?.response?.text === 'string') {
    return response.response.text;
  }

  if (Array.isArray(response?.candidates)) {
    const parts = [];

    for (const candidate of response.candidates) {
      const candidateParts = candidate?.content?.parts;
      if (!Array.isArray(candidateParts)) continue;

      for (const part of candidateParts) {
        if (typeof part?.text === 'string') {
          parts.push(part.text);
        }
      }
    }

    if (parts.length > 0) {
      return parts.join('\n');
    }
  }

  return '';
}

function parseSingleResponse(rawText) {
  const cleaned = stripMarkdownFences(rawText);
  const parsed = JSON.parse(cleaned);

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Gemini response is not an object');
  }

  return parsed;
}

function normalizeAnalysisResult(row, parsed) {
  const id = typeof parsed?.id === 'string' ? parsed.id : row.id;
  const detectedLang = sanitizeLocaleCode(parsed?.detectedLang);
  const confidence =
    typeof parsed?.confidence === 'number' ? parsed.confidence : null;
  const reason =
    typeof parsed?.reason === 'string' ? parsed.reason.trim() : null;

  if (id !== row.id) {
    return {
      audioFileId: row.id,
      userId: row.user_id,
      model: row.model,
      createdAt: row.created_at,
      detectedLang: null,
      confidence,
      reason,
      error: `Response id mismatch: expected ${row.id}, got ${id}`,
    };
  }

  if (!detectedLang) {
    return {
      audioFileId: row.id,
      userId: row.user_id,
      model: row.model,
      createdAt: row.created_at,
      detectedLang: null,
      confidence,
      reason,
      error: 'Invalid detectedLang returned by Gemini',
    };
  }

  return {
    audioFileId: row.id,
    userId: row.user_id,
    model: row.model,
    createdAt: row.created_at,
    detectedLang,
    confidence,
    reason,
    error: null,
  };
}

function extractBatchResponses(batchResponse) {
  if (Array.isArray(batchResponse?.responses)) {
    return batchResponse.responses;
  }

  if (Array.isArray(batchResponse?.output)) {
    return batchResponse.output;
  }

  if (Array.isArray(batchResponse?.result?.responses)) {
    return batchResponse.result.responses;
  }

  if (Array.isArray(batchResponse?.result?.output)) {
    return batchResponse.result.output;
  }

  return [];
}

async function waitForBatchCompletion(
  ai,
  batchName,
  options,
  {
    timeoutMs = DEFAULT_BATCH_TIMEOUT_MS,
    pollIntervalMs = DEFAULT_BATCH_POLL_INTERVAL_MS,
  } = {},
) {
  const startedAt = Date.now();

  while (true) {
    const batch = await ai.batches.get({ name: batchName });

    if (options.debug) {
      console.log(
        `Batch status: ${batchName} -> ${batch.state || batch.status || 'unknown'}`,
      );
    }

    const state = String(batch.state || batch.status || '').toUpperCase();

    if (
      state === 'JOB_STATE_SUCCEEDED' ||
      state === 'SUCCEEDED' ||
      state === 'COMPLETED' ||
      state === 'DONE'
    ) {
      return batch;
    }

    if (
      state === 'JOB_STATE_FAILED' ||
      state === 'FAILED' ||
      state === 'CANCELLED' ||
      state === 'JOB_STATE_CANCELLED'
    ) {
      throw new Error(
        `Gemini batch failed with state ${state}: ${JSON.stringify(batch)}`,
      );
    }

    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`Timed out waiting for Gemini batch ${batchName}`);
    }

    await delay(pollIntervalMs);
  }
}

async function analyzeRowsWithGeminiBatch(ai, rows, options) {
  if (rows.length === 0) {
    return [];
  }

  if (rows.length > INLINE_BATCH_REQUEST_LIMIT) {
    throw new Error(
      `Gemini batch request count ${rows.length} exceeds inline limit ${INLINE_BATCH_REQUEST_LIMIT}`,
    );
  }

  const batchRequests = buildBatchRequests(rows);

  if (options.debug) {
    console.log(
      `Creating Gemini batch with ${batchRequests.length} requests using model ${options.batchModel}`,
    );
  }

  const createdBatch = await ai.batches.create({
    model: options.batchModel,
    src: batchRequests,
    config: {
      displayName: `audio-language-analysis-${timestampForFilename()}`,
    },
  });

  const batchName = createdBatch.name || createdBatch.id;

  if (!batchName) {
    throw new Error(
      `Gemini batch create response did not include a batch name: ${JSON.stringify(createdBatch)}`,
    );
  }

  const completedBatch = await waitForBatchCompletion(ai, batchName, options);
  const responseItems = extractBatchResponses(completedBatch);
  const responseMap = new Map();

  for (const item of responseItems) {
    const key =
      item?.metadata?.key ||
      item?.requestMetadata?.key ||
      item?.metadata_key ||
      item?.key ||
      null;

    if (!key) continue;

    const rawText =
      extractResponseText(item?.response) ||
      extractResponseText(item) ||
      String(item?.outputText || '');

    responseMap.set(key, {
      key,
      rawText,
      raw: item,
    });
  }

  return rows.map((row) => {
    const responseItem = responseMap.get(row.id);

    if (!responseItem) {
      return {
        audioFileId: row.id,
        userId: row.user_id,
        model: row.model,
        createdAt: row.created_at,
        detectedLang: null,
        confidence: null,
        reason: null,
        error: 'Missing item in Gemini batch response',
      };
    }

    try {
      const parsed = parseSingleResponse(responseItem.rawText);
      return normalizeAnalysisResult(row, parsed);
    } catch (error) {
      return {
        audioFileId: row.id,
        userId: row.user_id,
        model: row.model,
        createdAt: row.created_at,
        detectedLang: null,
        confidence: null,
        reason: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
}

/*
async function updateAudioFileMetadata(supabase, row, analysis) {
  const currentMetadata = getMetadataObject(row.metadata);

  const updatedMetadata = {
    ...currentMetadata,
    detectedLang: analysis.detectedLang,
    detectedLangConfidence:
      typeof analysis.confidence === 'number' ? analysis.confidence : undefined,
    detectedLangReason: analysis.reason ?? undefined,
    detectedLangAnalyzedAt: new Date().toISOString(),
    detectedLangAnalyzedBy: analysis.batchModel ?? DEFAULT_BATCH_MODEL,
  };

  const { error } = await supabase
    .from('audio_files')
    .update({ metadata: updatedMetadata })
    .eq('id', row.id);

  if (error) {
    throw new Error(`Error updating audio_file ${row.id}: ${error.message}`);
  }
}
*/

function aggregateInsights(results) {
  const successful = results.filter(
    (result) => !result.error && result.detectedLang,
  );
  const failed = results.filter((result) => result.error);

  const languageDistribution = {};
  const modelDistribution = {};
  const modelLanguageDistribution = {};

  for (const result of successful) {
    languageDistribution[result.detectedLang] =
      (languageDistribution[result.detectedLang] || 0) + 1;

    modelDistribution[result.model] =
      (modelDistribution[result.model] || 0) + 1;

    if (!modelLanguageDistribution[result.model]) {
      modelLanguageDistribution[result.model] = {};
    }

    modelLanguageDistribution[result.model][result.detectedLang] =
      (modelLanguageDistribution[result.model][result.detectedLang] || 0) + 1;
  }

  const sortedLanguages = Object.entries(languageDistribution)
    .sort((a, b) => b[1] - a[1])
    .map(([language, count]) => ({ language, count }));

  const sortedModels = Object.entries(modelDistribution)
    .sort((a, b) => b[1] - a[1])
    .map(([model, count]) => ({ model, count }));

  return {
    totalProcessed: results.length,
    totalSuccessful: successful.length,
    totalFailed: failed.length,
    languageDistribution: sortedLanguages,
    modelDistribution: sortedModels,
    modelLanguageDistribution,
    failures: failed.map((result) => ({
      audioFileId: result.audioFileId,
      model: result.model,
      error: result.error,
    })),
  };
}

function toCsv(results) {
  const headers = [
    'audio_file_id',
    'user_id',
    'model',
    'created_at',
    'detected_lang',
    'confidence',
    'reason',
    'error',
  ];

  const escapeCsvValue = (value) => {
    const stringValue =
      value === null || value === undefined ? '' : String(value);

    if (
      stringValue.includes(',') ||
      stringValue.includes('"') ||
      stringValue.includes('\n')
    ) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }

    return stringValue;
  };

  const lines = [
    headers.join(','),
    ...results.map((result) =>
      [
        result.audioFileId,
        result.userId,
        result.model,
        result.createdAt,
        result.detectedLang,
        result.confidence,
        result.reason,
        result.error,
      ]
        .map(escapeCsvValue)
        .join(','),
    ),
  ];

  return `${lines.join('\n')}\n`;
}

function printRunHeader(options) {
  console.log('='.repeat(80));
  console.log('AUDIO FILES LANGUAGE ANALYSIS');
  console.log('='.repeat(80));
  console.log(`Batch model: ${options.batchModel}`);
  console.log(`Days: ${options.days}`);
  console.log(
    `Models filter: ${
      options.models.length > 0 ? options.models.join(', ') : '(all models)'
    }`,
  );
  console.log(`Min credits used: ${options.minCreditsUsed ?? '(none)'}`);
  console.log(
    `Include free users: ${options.includeFreeUsers ? 'yes' : 'no (paid users only)'}`,
  );
  console.log(`Dry run: ${options.dryRun ? 'yes' : 'no'}`);
  console.log(`Force re-analysis: ${options.force ? 'yes' : 'no'}`);
  console.log(`Limit: ${options.limit ?? '(none)'}`);
  console.log();
}

async function maybeRunSmokeTest(ai, options) {
  if (!options.smokeTest) {
    return;
  }

  console.log('Running Gemini smoke test...');
  const smokeTestResponse = await runSmokeTest(ai, options.batchModel);
  console.log(`Smoke test response: ${smokeTestResponse}`);
  console.log();
}

function createBatchFailureResults(rows, message, batchModel) {
  return rows.map((row) => ({
    audioFileId: row.id,
    userId: row.user_id,
    model: row.model,
    createdAt: row.created_at,
    detectedLang: null,
    confidence: null,
    reason: null,
    error: message,
    batchModel,
  }));
}

async function analyzeRowsSafely(ai, rows, options) {
  try {
    const results = await analyzeRowsWithGeminiBatch(ai, rows, options);
    return results.map((result) => ({
      ...result,
      batchModel: options.batchModel,
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`❌ Gemini batch failed: ${message}`);
    return createBatchFailureResults(rows, message, options.batchModel);
  }
}

function maybeUpdateAudioFile(rowsById, analysis, options) {
  if (analysis.error || !analysis.detectedLang) {
    console.warn(
      `⚠️ Skipping update for ${analysis.audioFileId}: ${
        analysis.error || 'missing detectedLang'
      }`,
    );
    return;
  }

  if (options.dryRun) {
    return;
  }

  const row = rowsById.get(analysis.audioFileId);
  if (!row) {
    console.warn(
      `⚠️ Could not find source row for ${analysis.audioFileId} during update`,
    );
    return;
  }

  // Metadata writes are temporarily disabled until audio_files.metadata exists.
}

async function processRows(ai, rows, options) {
  console.log(`Submitting ${rows.length} rows to Gemini batch API...`);
  const results = await analyzeRowsSafely(ai, rows, options);
  const rowsById = new Map(rows.map((row) => [row.id, row]));

  for (const analysis of results) {
    maybeUpdateAudioFile(rowsById, analysis, options);
  }

  return results;
}

function writeOutputFiles(results, insights) {
  const timestamp = timestampForFilename();
  const csvPath = `${OUTPUT_FILE_PREFIX}-${timestamp}.csv`;
  const jsonPath = `${OUTPUT_FILE_PREFIX}-${timestamp}-insights.json`;

  writeFileSync(csvPath, toCsv(results), 'utf8');
  writeFileSync(jsonPath, JSON.stringify(insights, null, 2), 'utf8');

  return { csvPath, jsonPath };
}

function printSummary(insights, outputPaths, options) {
  console.log();
  console.log('='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log(`Processed: ${insights.totalProcessed}`);
  console.log(`Successful: ${insights.totalSuccessful}`);
  console.log(`Failed: ${insights.totalFailed}`);

  if (insights.languageDistribution.length > 0) {
    console.log('\nTop detected languages:');
    for (const entry of insights.languageDistribution.slice(0, 15)) {
      console.log(`  ${entry.language}: ${entry.count}`);
    }
  }

  console.log(`\nCSV written to: ${outputPaths.csvPath}`);
  console.log(`Insights written to: ${outputPaths.jsonPath}`);

  if (options.dryRun) {
    console.log('\nDry run enabled: database was not updated.');
  } else {
    console.log('\nDatabase update completed.');
  }
}

async function main() {
  const options = parseArgs();

  printRunHeader(options);

  const supabase = createAdminClient();
  const ai = createGeminiClient();

  await maybeRunSmokeTest(ai, options);

  console.log('Fetching candidate audio files...');
  const candidates = await getCandidateAudioFiles(supabase, options);

  console.log(`Found ${candidates.length} candidate audio files`);
  if (candidates.length === 0) {
    console.log('No rows to process. Exiting.');
    return;
  }

  const results = await processRows(ai, candidates, options);
  const insights = aggregateInsights(results);
  const outputPaths = writeOutputFiles(results, insights);

  printSummary(insights, outputPaths, options);
}

main().catch((error) => {
  console.error('\n❌ Script failed');
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
