import { FinishReason, type GenerateContentResponse } from '@google/genai';

/**
 * Gemini may return a text/safety part before the audio part, so scan all
 * candidates and parts for the first one carrying inline audio data instead
 * of hard-indexing candidates[0].content.parts[0].
 */
export function extractInlineAudio(response: GenerateContentResponse | null): {
  data: string | undefined;
  mimeType: string | undefined;
} {
  for (const candidate of response?.candidates ?? []) {
    for (const part of candidate.content?.parts ?? []) {
      if (part.inlineData?.data) {
        return {
          data: part.inlineData.data,
          mimeType: part.inlineData.mimeType,
        };
      }
    }
  }
  return { data: undefined, mimeType: undefined };
}

export type GeminiTtsResponseOutcome =
  | 'content_blocked'
  | 'no_audio'
  | 'success'
  | 'unexpected';

export type GeminiTtsErrorCode =
  | 'NO_AUDIO_DATA'
  | 'OTHER_GEMINI_BLOCK'
  | 'PROHIBITED_CONTENT';

const GEMINI_OUTCOME_ERROR_CODES: Record<
  GeminiTtsResponseOutcome,
  GeminiTtsErrorCode | undefined
> = {
  content_blocked: 'PROHIBITED_CONTENT',
  no_audio: 'NO_AUDIO_DATA',
  success: undefined,
  unexpected: 'OTHER_GEMINI_BLOCK',
};

export function geminiOutcomeToErrorCode(
  outcome: GeminiTtsResponseOutcome,
): GeminiTtsErrorCode | undefined {
  return GEMINI_OUTCOME_ERROR_CODES[outcome];
}

export function classifyGeminiTtsResponse({
  blockReason,
  finishReason,
  hasAudio,
}: {
  blockReason?: string;
  finishReason?: FinishReason;
  hasAudio: boolean;
}): GeminiTtsResponseOutcome {
  if (
    finishReason === FinishReason.SAFETY ||
    finishReason === FinishReason.PROHIBITED_CONTENT ||
    finishReason === FinishReason.BLOCKLIST ||
    finishReason === FinishReason.SPII ||
    blockReason === 'SAFETY' ||
    blockReason === 'PROHIBITED_CONTENT' ||
    blockReason === 'BLOCKLIST'
  ) {
    return 'content_blocked';
  }

  if (finishReason === FinishReason.STOP && hasAudio) {
    return 'success';
  }

  if (
    !hasAudio &&
    (finishReason === FinishReason.STOP || finishReason === FinishReason.OTHER)
  ) {
    return 'no_audio';
  }

  return 'unexpected';
}
