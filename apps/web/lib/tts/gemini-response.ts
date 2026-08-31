import { FinishReason } from '@google/genai';

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
