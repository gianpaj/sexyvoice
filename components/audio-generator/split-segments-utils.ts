'use client';

export const SPLIT_TEXT_MIN_LENGTH = 500;
export const SPLIT_SEGMENT_MAX_LENGTH = 500;
const SPLIT_STORAGE_PREFIX = 'generate-split-segments-v1';

export type SplitSegmentStatus = 'idle' | 'generating' | 'success' | 'failed';

export interface SplitSegmentItem {
  id: string;
  text: string;
  status: SplitSegmentStatus;
  audioUrl: string;
}

export interface PersistedSplitSegments {
  segments: Array<{
    text: string;
    status: SplitSegmentStatus;
    audioUrl?: string;
  }>;
  generatedByText?: Record<string, string>;
}

export function buildSplitStorageKey(voiceName: string, text: string): string {
  return `${SPLIT_STORAGE_PREFIX}:${voiceName}:${text}`;
}

export function splitLongTextIntoSegments(text: string): string[] {
  const trimmedText = text.trim();
  if (!trimmedText) {
    return [];
  }

  const sentenceLikeChunks = trimmedText
    .split('.')
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk, index, array) =>
      index < array.length - 1 || trimmedText.endsWith('.')
        ? `${chunk}.`
        : chunk,
    );

  const segments: string[] = [];
  let currentSegment = '';

  const pushCurrentSegment = () => {
    const cleaned = currentSegment.trim();
    if (cleaned) {
      segments.push(cleaned);
    }
    currentSegment = '';
  };

  for (const sentence of sentenceLikeChunks) {
    const candidate = currentSegment
      ? `${currentSegment} ${sentence}`.trim()
      : sentence;

    if (candidate.length <= SPLIT_SEGMENT_MAX_LENGTH) {
      currentSegment = candidate;
      continue;
    }

    if (currentSegment) {
      pushCurrentSegment();
    }

    if (sentence.length <= SPLIT_SEGMENT_MAX_LENGTH) {
      currentSegment = sentence;
      continue;
    }

    let remaining = sentence;
    while (remaining.length > SPLIT_SEGMENT_MAX_LENGTH) {
      segments.push(remaining.slice(0, SPLIT_SEGMENT_MAX_LENGTH).trim());
      remaining = remaining.slice(SPLIT_SEGMENT_MAX_LENGTH).trim();
    }

    currentSegment = remaining;
  }

  pushCurrentSegment();
  return segments;
}

export function getSplitSegmentStatusLabel(status: SplitSegmentStatus): string {
  switch (status) {
    case 'success':
      return 'Generated';
    case 'generating':
      return 'Generating...';
    case 'failed':
      return 'Failed';
    default:
      return 'Pending';
  }
}

export function generateRetrySeed(): number {
  return Math.floor(1_000_000 + Math.random() * 9_000_000);
}
