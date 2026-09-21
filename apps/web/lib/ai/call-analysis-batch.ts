import { z } from 'zod';

import {
  buildCallAnalysisPrompt,
  CALL_ANALYSIS_SYSTEM_PROMPT,
  type CallAnalysis,
  type CallSessionForAnalysis,
  callAnalysisSchema,
  finalizeCallAnalysis,
  getAnalysisModelId,
  parseCallAnalysisResponse,
} from './analyze-call.ts';
import {
  createBatch,
  getBatchOutcomes,
  toBatchJsonl,
  uploadBatchInputFile,
  type XaiBatchOutcome,
  type XaiChatCompletionBatchRequest,
} from './xai-batch.ts';

// Shared with `scripts/` via Node's native type stripping: keep relative
// imports extension-qualified and avoid `@/` aliases in this module.

/** Per-session context needed to turn a batch outcome back into an analysis. */
export interface CallAnalysisBatchContext {
  assistantOnlyNote: string | null;
  session: CallSessionForAnalysis;
}

export type CallAnalysisBatchResult =
  | { analysis: CallAnalysis; error?: undefined; sessionId: string }
  | { analysis?: undefined; error: string; sessionId: string };

// The realtime path hands the zod schema to `generateObject`; the Batch API is
// a raw chat-completions request, so embed the equivalent JSON Schema in the
// prompt and validate the response against the same zod schema on the way back.
const JSON_SCHEMA_TEXT = JSON.stringify(
  z.toJSONSchema(callAnalysisSchema),
  null,
  2,
);

export function buildBatchPrompt(prompt: string): string {
  return `${prompt}

Respond with ONLY a JSON object (no markdown, no code blocks) that matches this JSON Schema:
${JSON_SCHEMA_TEXT}`;
}

/**
 * Build the JSONL request for a session, or an error result when the
 * transcript has no usable messages (mirrors the realtime path's early exit).
 */
export function prepareCallAnalysisBatchRequest(
  session: CallSessionForAnalysis,
  model = getAnalysisModelId(),
):
  | {
      context: CallAnalysisBatchContext;
      request: XaiChatCompletionBatchRequest;
    }
  | { error: string } {
  const input = buildCallAnalysisPrompt(session);
  if (!input) {
    return { error: 'No messages in transcript' };
  }

  return {
    context: { assistantOnlyNote: input.assistantOnlyNote, session },
    request: {
      body: {
        messages: [
          { content: CALL_ANALYSIS_SYSTEM_PROMPT, role: 'system' },
          { content: buildBatchPrompt(input.prompt), role: 'user' },
        ],
        model,
      },
      custom_id: session.id,
      method: 'POST',
      url: '/v1/chat/completions',
    },
  };
}

/** Turn a single batch outcome back into a validated analysis or an error. */
export function resolveCallAnalysisBatchOutcome(
  context: CallAnalysisBatchContext,
  outcome: XaiBatchOutcome | undefined,
): CallAnalysisBatchResult {
  const sessionId = context.session.id;
  if (!outcome) {
    return { error: 'No batch result returned', sessionId };
  }
  if (outcome.errorMessage || !outcome.content) {
    return {
      error: outcome.errorMessage || 'Empty batch response',
      sessionId,
    };
  }

  try {
    const analysis = parseCallAnalysisResponse(outcome.content);
    return {
      analysis: finalizeCallAnalysis(analysis, context.assistantOnlyNote),
      sessionId,
    };
  } catch (error) {
    // An unparseable or off-schema response is a failure, not an analysis, so
    // it stays retryable and never persists an all-null row.
    const message = error instanceof Error ? error.message : String(error);
    return { error: `parse failed: ${message}`, sessionId };
  }
}

export interface SubmittedCallAnalysisBatch {
  batchId: string;
  contexts: Map<string, CallAnalysisBatchContext>;
  /** Sessions rejected before upload (no usable transcript). */
  rejected: CallAnalysisBatchResult[];
}

/**
 * Upload one JSONL file covering every analysable session and create the xAI
 * batch. Returns `batchId: null` when no session produced a request.
 */
export async function submitCallAnalysisBatch(
  sessions: CallSessionForAnalysis[],
  model = getAnalysisModelId(),
): Promise<
  | SubmittedCallAnalysisBatch
  | { batchId: null; rejected: CallAnalysisBatchResult[] }
> {
  const contexts = new Map<string, CallAnalysisBatchContext>();
  const requests: XaiChatCompletionBatchRequest[] = [];
  const rejected: CallAnalysisBatchResult[] = [];

  for (const session of sessions) {
    const prepared = prepareCallAnalysisBatchRequest(session, model);
    if ('error' in prepared) {
      rejected.push({ error: prepared.error, sessionId: session.id });
      continue;
    }
    contexts.set(session.id, prepared.context);
    requests.push(prepared.request);
  }

  if (requests.length === 0) {
    return { batchId: null, rejected };
  }

  const fileId = await uploadBatchInputFile(
    toBatchJsonl(requests),
    'call-analysis-batch.jsonl',
  );
  const batchId = await createBatch(`call-analysis-${requests.length}`, fileId);
  return { batchId, contexts, rejected };
}

/** Fetch a settled batch's results and map them back onto the sessions. */
export async function collectCallAnalysisBatchResults(
  batchId: string,
  contexts: Map<string, CallAnalysisBatchContext>,
): Promise<CallAnalysisBatchResult[]> {
  const outcomes = await getBatchOutcomes(batchId);
  return [...contexts.values()].map((context) =>
    resolveCallAnalysisBatchOutcome(context, outcomes.get(context.session.id)),
  );
}
