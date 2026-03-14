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

async function hashText(text: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(text);
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function buildSplitStorageKey(
  voiceName: string,
  text: string,
): Promise<string> {
  const hash = await hashText(text);
  return `${SPLIT_STORAGE_PREFIX}:${voiceName}:${hash}`;
}

export function splitLongTextIntoSegments(text: string): string[] {
  const trimmedText = text.trim();
  if (!trimmedText) {
    return [];
  }

  const sentenceLikeChunks =
    trimmedText
      .match(/[^.!?]+[.!?]*/g)
      ?.map((chunk) => chunk.trim())
      .filter(Boolean) ?? [];

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

export function getSplitSegmentStatusLabel(
  status: SplitSegmentStatus,
  dict: {
    statusGenerated: string;
    statusGenerating: string;
    statusFailed: string;
    statusPending: string;
  },
): string {
  switch (status) {
    case 'success':
      return dict.statusGenerated;
    case 'generating':
      return dict.statusGenerating;
    case 'failed':
      return dict.statusFailed;
    default:
      return dict.statusPending;
  }
}

export function generateRetrySeed(): number {
  return Math.floor(1_000_000 + Math.random() * 9_000_000);
}
