import { xai } from '@ai-sdk/xai';
import { generateObject } from 'ai';
import { z } from 'zod';

// `Json` is a global ambient type from lib/supabase/types.d.ts.

// Confirm the exact current Grok model id against xAI docs; override via env.
const DEFAULT_MODEL = 'grok-4-fast-non-reasoning';

export const callAnalysisSchema = z.object({
  title: z.string().describe('A short, descriptive title for the call'),
  summary: z
    .string()
    .describe('A concise paragraph summarising what the call was about'),
  key_points: z
    .array(z.string())
    .describe('The most important points discussed, as short bullet strings'),
  sentiment: z
    .enum(['positive', 'neutral', 'negative', 'mixed'])
    .describe("The caller's overall sentiment during the call"),
  action_items: z
    .array(z.string())
    .describe('Concrete follow-up actions, if any (empty array if none)'),
});

export type CallAnalysis = z.infer<typeof callAnalysisSchema>;

// What we persist into call_sessions.analysis — the model output plus a small
// self-describing meta block so the column makes sense as it grows over time.
export type StoredCallAnalysis = CallAnalysis & {
  meta: {
    model: string;
    generated_at: string;
  };
};

interface TranscriptTurn {
  role?: unknown;
  speaker?: unknown;
  content?: unknown;
  text?: unknown;
  message?: unknown;
}

function asText(value: unknown): string | null {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    // e.g. content parts: [{ text: '...' }] or ['...']
    const parts = value.map(asText).filter((part): part is string => !!part);
    return parts.length > 0 ? parts.join(' ') : null;
  }
  if (value && typeof value === 'object') {
    return asText(
      (value as TranscriptTurn).text ?? (value as TranscriptTurn).content,
    );
  }
  return null;
}

/**
 * The transcript JSONB is written by the external LiveKit agent, so its exact
 * shape is not guaranteed here. Defensively flatten the array of turns into
 * "role: text" lines, tolerating { role, content } / { role, text } / plain
 * strings.
 */
export function normalizeTranscript(transcript: Json | null): string {
  if (!transcript) {
    return '';
  }

  const turns = Array.isArray(transcript) ? transcript : [transcript];

  const lines: string[] = [];
  for (const turn of turns) {
    if (typeof turn === 'string') {
      const text = turn.trim();
      if (text) {
        lines.push(text);
      }
      continue;
    }

    if (turn && typeof turn === 'object') {
      const t = turn as TranscriptTurn;
      const role =
        (typeof t.role === 'string' && t.role) ||
        (typeof t.speaker === 'string' && t.speaker) ||
        'speaker';
      const text = asText(t.content ?? t.text ?? t.message)?.trim();
      if (text) {
        lines.push(`${role}: ${text}`);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Summarise a completed call transcript into a structured analysis using Grok.
 * Throws if the transcript is empty or the model fails / returns invalid output.
 */
export async function summarizeCall(
  transcript: Json | null,
): Promise<StoredCallAnalysis> {
  const text = normalizeTranscript(transcript);
  if (!text) {
    throw new Error('Cannot summarize an empty transcript');
  }

  const modelId = process.env.XAI_SUMMARY_MODEL ?? DEFAULT_MODEL;

  const { object } = await generateObject({
    model: xai(modelId),
    schema: callAnalysisSchema,
    system:
      'You analyse transcripts of voice calls between a user and an AI voice agent. ' +
      'Produce an accurate, concise structured analysis. Do not invent details ' +
      'that are not present in the transcript. If there are no clear action items, ' +
      'return an empty array.',
    prompt: `Analyse the following call transcript:\n\n${text}`,
    experimental_telemetry: {
      isEnabled: true,
      recordInputs: true,
      recordOutputs: true,
    },
  });

  return {
    ...object,
    meta: {
      model: modelId,
      generated_at: new Date().toISOString(),
    },
  };
}
