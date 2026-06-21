import { xai } from '@ai-sdk/xai';
import { generateObject } from 'ai';
import { z } from 'zod';

// `Json` is a global ambient type from lib/supabase/types.d.ts.

// Only calls at least this long are worth analysing; mirrors the
// analyze-call-sessions.mjs script so the webhook, recent-cron and backfill
// paths all agree on what counts as analysable.
export const MIN_ANALYSIS_CALL_DURATION_SECONDS = 120;

// Confirm the exact current Grok model id against xAI docs; override via env.
const DEFAULT_MODEL = 'grok-4';
const MAX_CONVERSATION_CHARS = 4000;

// LLM-facing schema. Keys match the prompt and the analyze-call-sessions.mjs
// script; `toAnalysisRow` maps them onto the call_session_analysis columns.
export const callAnalysisSchema = z.object({
  language: z
    .string()
    .describe(
      'ISO 639-1 two-letter code of the primary language used by the USER when ' +
        'user messages are available; otherwise infer from the overall context',
    ),
  topic_category: z.enum([
    'roleplay_intimate',
    'roleplay_fantasy',
    'casual_chat',
    'emotional_support',
    'asmr_relaxation',
    'fetish_content',
    'other',
  ]),
  topic_subcategory: z
    .string()
    .describe(
      "More specific topic (e.g. 'daddy_dom', 'girlfriend_experience', 'meditation')",
    ),
  user_engagement_level: z.enum(['high', 'medium', 'low', 'minimal']),
  conversation_quality: z.enum(['flowing', 'choppy', 'one_sided', 'dying']),
  where_conversation_died: z
    .string()
    .nullable()
    .describe(
      'What caused disengagement, or null if the conversation flowed well',
    ),
  user_sentiment: z.enum([
    'satisfied',
    'frustrated',
    'bored',
    'engaged',
    'confused',
  ]),
  key_user_requests: z
    .array(z.string())
    .describe('Main things the user asked for or wanted'),
  ai_compliance_issues: z
    .string()
    .nullable()
    .describe(
      'Any issues with AI responses (too loud, wrong tone, etc.) or null',
    ),
  notable_patterns: z
    .string()
    .nullable()
    .describe(
      'Notable patterns or insights, including missing user transcription',
    ),
});

export type CallAnalysis = z.infer<typeof callAnalysisSchema>;

export interface CallSessionForAnalysis {
  id: string;
  user_id?: string | null;
  started_at?: string | null;
  duration_seconds?: number | null;
  end_reason?: string | null;
  transcript: Json | null;
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string | null;
}

interface TranscriptTurn {
  role?: unknown;
  content?: unknown;
  text?: unknown;
  transcript?: unknown;
  timestamp?: unknown;
  created_at?: unknown;
  time?: unknown;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function pickTimestamp(turn: TranscriptTurn): string | null {
  const ts = turn.timestamp ?? turn.created_at ?? turn.time;
  return typeof ts === 'string' ? ts : null;
}

/**
 * The transcript JSON is written by the external LiveKit agent and is not a
 * guaranteed shape. Handle a bare array, `{ messages }` (assistant turns) and
 * `{ user_transcriptions }` (user turns), normalising to role/content/timestamp
 * and sorting chronologically. Ported from scripts/analyze-call-sessions.mjs.
 */
export function extractMessages(
  transcript: Json | null,
): ConversationMessage[] {
  if (!transcript) {
    return [];
  }

  const root = transcript as {
    messages?: unknown;
    user_transcriptions?: unknown;
  };

  let assistantTurns: TranscriptTurn[] = [];
  if (Array.isArray(transcript)) {
    assistantTurns = transcript as TranscriptTurn[];
  } else if (Array.isArray(root.messages)) {
    assistantTurns = root.messages as TranscriptTurn[];
  }

  const userTurns: TranscriptTurn[] = Array.isArray(root.user_transcriptions)
    ? (root.user_transcriptions as TranscriptTurn[])
    : [];

  const normalizedAssistant = assistantTurns
    .filter(
      (turn): turn is TranscriptTurn => !!turn && typeof turn === 'object',
    )
    .map((turn) => ({
      role: (asString(turn.role) || 'assistant') as 'user' | 'assistant',
      content: (asString(turn.content) || asString(turn.text)).trim(),
      timestamp: pickTimestamp(turn),
    }))
    .filter((msg) => msg.content);

  const normalizedUser = userTurns
    .filter(
      (turn): turn is TranscriptTurn => !!turn && typeof turn === 'object',
    )
    .map((turn) => ({
      role: 'user' as const,
      content: (
        asString(turn.content) ||
        asString(turn.text) ||
        asString(turn.transcript)
      ).trim(),
      timestamp: pickTimestamp(turn),
    }))
    .filter((msg) => msg.content);

  return [...normalizedAssistant, ...normalizedUser].sort((a, b) => {
    const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return timeA - timeB;
  });
}

/** Condense the conversation into a USER:/AI: transcript for the LLM prompt. */
export function buildConversationSummary(
  messages: ConversationMessage[],
  maxLength = MAX_CONVERSATION_CHARS,
): string {
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

/**
 * Analyse a call transcript with Grok and return the structured analysis.
 * Throws if the transcript yields no messages or the model fails.
 */
export async function analyzeTranscript(
  session: CallSessionForAnalysis,
): Promise<CallAnalysis> {
  const messages = extractMessages(session.transcript);
  if (messages.length === 0) {
    throw new Error('No messages in transcript');
  }

  const conversationSummary = buildConversationSummary(messages);
  const userMessageCount = messages.filter((m) => m.role === 'user').length;
  const assistantOnlyNote =
    userMessageCount === 0
      ? 'No user transcription detected; analysis based on assistant transcript only.'
      : null;

  const modelId = process.env.XAI_SUMMARY_MODEL ?? DEFAULT_MODEL;

  const { object } = await generateObject({
    model: xai(modelId),
    schema: callAnalysisSchema,
    system:
      'You analyse transcripts of AI voice calls between a user and an AI voice ' +
      'agent. Produce an accurate, structured analysis. Do not invent details ' +
      'not present in the transcript. When user transcription is missing, infer ' +
      'from context and mention it in notable_patterns.',
    prompt: `Analyze this AI voice call conversation.

CONVERSATION:
${conversationSummary}

CONTEXT:
- Call duration: ${session.duration_seconds ?? 'unknown'} seconds
- End reason: ${session.end_reason || 'unknown'}
- Total messages: ${messages.length}
${assistantOnlyNote ? `- Note: ${assistantOnlyNote}` : ''}`,
    experimental_telemetry: {
      isEnabled: true,
      recordInputs: true,
      recordOutputs: true,
    },
  });

  if (assistantOnlyNote) {
    object.notable_patterns = object.notable_patterns
      ? `${object.notable_patterns} ${assistantOnlyNote}`
      : assistantOnlyNote;
  }

  return object;
}

/** Map the LLM analysis onto a call_session_analysis insert row. */
export function toAnalysisRow(
  session: CallSessionForAnalysis,
  analysis: CallAnalysis,
) {
  return {
    session_id: session.id,
    user_id: session.user_id ?? null,
    started_at: session.started_at ?? null,
    duration_seconds: session.duration_seconds ?? null,
    end_reason: session.end_reason ?? null,
    language: analysis.language,
    topic_category: analysis.topic_category,
    topic_subcategory: analysis.topic_subcategory,
    engagement_level: analysis.user_engagement_level,
    conversation_quality: analysis.conversation_quality,
    where_died: analysis.where_conversation_died,
    user_sentiment: analysis.user_sentiment,
    key_requests: analysis.key_user_requests,
    ai_issues: analysis.ai_compliance_issues,
    notable_patterns: analysis.notable_patterns,
    error: null,
    analyzed_at: new Date().toISOString(),
  };
}
