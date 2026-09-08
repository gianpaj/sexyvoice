import type { FinishReason, GenerateContentResponse } from '@google/genai';
import { captureException } from '@sentry/nextjs';
import { after } from 'next/server';

import { calculateGenerateApiDollarAmount } from '@/lib/api/pricing';
import { insertUsageEvent } from '@/lib/supabase/queries';
import { parseGoogleApiError } from '@/utils/google-errors';
import { classifyGeminiTtsResponse } from './gemini-response';

type UsageMetadata = GenerateContentResponse['usageMetadata'];

export function mergeGeminiUsage(
  previous: UsageMetadata,
  next: UsageMetadata,
): UsageMetadata {
  if (!next) return previous;
  return {
    ...previous,
    ...Object.fromEntries(
      Object.entries(next).filter(
        ([, value]) => value !== null && typeof value !== 'undefined',
      ),
    ),
  };
}

function tokenCount(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

interface AttemptContext {
  apiKeyId?: string;
  inputChars: number;
  model: string;
  requestId: string;
  signal?: AbortSignal;
  sourceType: 'tts' | 'api_tts';
  userId: string;
}

function createAttempt(context: AttemptContext, streaming: boolean) {
  const occurredAt = new Date().toISOString();
  let usage: UsageMetadata;
  let finishReason: FinishReason | undefined;
  let blockReason: string | undefined;
  let responseId: string | undefined;
  let httpStatus: number | null = null;
  let hasAudio = false;
  let receivedResponse = false;

  return {
    observe(response: GenerateContentResponse) {
      receivedResponse = true;
      httpStatus = response.sdkHttpResponse?.responseInternal?.status ?? 200;
      usage = mergeGeminiUsage(usage, response.usageMetadata);
      finishReason = response.candidates?.[0]?.finishReason ?? finishReason;
      blockReason = response.promptFeedback?.blockReason ?? blockReason;
      responseId = response.responseId ?? responseId;
      hasAudio ||= Boolean(
        response.candidates?.some((candidate) =>
          candidate.content?.parts?.some(
            (part) => part.inlineData?.data && part.inlineData?.mimeType,
          ),
        ),
      );
    },
    async record(error?: unknown, completed = true) {
      // Observability must not trigger a fallback, refund, or generation failure.
      try {
        const errorStatus =
          parseGoogleApiError(error)?.code ??
          (typeof error === 'object' &&
          error !== null &&
          'status' in error &&
          typeof error.status === 'number'
            ? error.status
            : null);
        if (errorStatus === 400 || errorStatus === 500) return;
        const inputTokens = tokenCount(usage?.promptTokenCount);
        const outputTokens = tokenCount(usage?.candidatesTokenCount);
        const totalTokens = tokenCount(usage?.totalTokenCount);
        const dollarAmount =
          inputTokens !== null && outputTokens !== null
            ? calculateGenerateApiDollarAmount({
                candidatesTokenCount: outputTokens,
                model: context.model,
                promptTokenCount: inputTokens,
                provider: 'google',
                sourceType: context.sourceType,
              })
            : null;
        let outcome: string = classifyGeminiTtsResponse({
          blockReason,
          finishReason,
          hasAudio,
        });
        if (!completed) outcome = 'incomplete';
        if (error) outcome = 'error';
        if (context.signal?.aborted) outcome = 'aborted';
        await insertUsageEvent({
          apiKeyId: context.apiKeyId,
          creditsUsed: 0,
          dollarAmount,
          eventKind: 'provider_attempt',
          inputChars: context.inputChars,
          inputTokens,
          metadata: {
            blockReason: blockReason ?? null,
            completed,
            costStatus: dollarAmount === null ? 'unknown' : 'estimated',
            finishReason: finishReason ?? null,
            httpStatus: errorStatus ?? httpStatus,
            outcome,
            provider: 'google',
            receivedResponse,
            responseId: responseId ?? null,
            stream: streaming,
            usageMetadata: usage ? JSON.parse(JSON.stringify(usage)) : null,
          },
          model: context.model,
          occurredAt,
          outputTokens,
          quantity: 1,
          requestId: context.requestId,
          sourceType: context.sourceType,
          totalTokens,
          unit: 'operation',
          userId: context.userId,
        });
      } catch (loggingError) {
        captureException(loggingError, { tags: { context: 'gemini_usage' } });
      }
    },
  };
}

export async function trackGeminiGeneration(
  context: AttemptContext,
  generate: () => Promise<GenerateContentResponse>,
): Promise<GenerateContentResponse> {
  const attempt = createAttempt(context, false);
  let failure: unknown;
  try {
    const response = await generate();
    attempt.observe(response);
    return response;
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    after(() => attempt.record(failure, failure === undefined));
  }
}

export async function* trackGeminiStream(
  context: AttemptContext,
  generate: () => Promise<AsyncIterable<GenerateContentResponse>>,
): AsyncGenerator<GenerateContentResponse> {
  const attempt = createAttempt(context, true);
  let failure: unknown;
  let completed = false;
  try {
    const stream = await generate();
    for await (const response of stream) {
      attempt.observe(response);
      yield response;
    }
    completed = true;
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    await attempt.record(failure, completed);
  }
}
