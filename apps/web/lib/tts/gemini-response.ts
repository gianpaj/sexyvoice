import { FinishReason } from '@google/genai';

export type GeminiTtsResponseOutcome =
  | 'content_blocked'
  | 'no_audio'
  | 'success'
  | 'unexpected';

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
    blockReason === 'SAFETY' ||
    blockReason === 'PROHIBITED_CONTENT'
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
