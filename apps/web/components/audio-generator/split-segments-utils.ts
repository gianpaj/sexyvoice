'use client';

import { GROK_WRAPPING_TAGS } from '@/lib/tts-editor';

export const SPLIT_TEXT_MIN_LENGTH = 500;
export const SPLIT_SEGMENT_MAX_LENGTH = 500;
const SPLIT_STORAGE_PREFIX = 'generate-split-segments-v1';

export type SplitSegmentStatus = 'idle' | 'generating' | 'success' | 'failed';

export interface SplitSegmentItem {
  audioUrl: string;
  id: string;
  status: SplitSegmentStatus;
  text: string;
}

export interface PersistedSplitSegments {
  generatedByText?: Record<string, string>;
  segments: Array<{
    audioUrl?: string;
    status: SplitSegmentStatus;
    text: string;
  }>;
}

interface SplitLongTextOptions {
  preserveGrokWrappingTags?: boolean;
}

interface SplitChunk {
  canSplit: boolean;
  text: string;
}

const GROK_WRAPPER_OPEN_TO_CLOSE = new Map<string, string>(GROK_WRAPPING_TAGS);
const GROK_WRAPPER_CLOSE_TAGS = new Set<string>(
  GROK_WRAPPING_TAGS.map(([, closeTag]) => closeTag),
);
const SORTED_GROK_WRAPPING_TAGS = GROK_WRAPPING_TAGS.flat().sort(
  (a, b) => b.length - a.length,
);

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

function getGrokWrappingTagAt(input: string, index: number): string | null {
  for (const tag of SORTED_GROK_WRAPPING_TAGS) {
    if (input.startsWith(tag, index)) {
      return tag;
    }
  }

  return null;
}

function readProtectedGrokWrappingChunk(
  input: string,
  startIndex: number,
): string | null {
  const openTag = getGrokWrappingTagAt(input, startIndex);
  const closeTag = openTag ? GROK_WRAPPER_OPEN_TO_CLOSE.get(openTag) : null;
  if (!(openTag && closeTag)) {
    return null;
  }

  const closeStack = [closeTag];
  let cursor = startIndex + openTag.length;

  while (cursor < input.length) {
    const tag = getGrokWrappingTagAt(input, cursor);
    if (!tag) {
      cursor += 1;
      continue;
    }

    const nestedCloseTag = GROK_WRAPPER_OPEN_TO_CLOSE.get(tag);
    if (nestedCloseTag) {
      closeStack.push(nestedCloseTag);
      cursor += tag.length;
      continue;
    }

    if (GROK_WRAPPER_CLOSE_TAGS.has(tag)) {
      const expectedCloseTag = closeStack.at(-1);
      if (tag === expectedCloseTag) {
        closeStack.pop();
        cursor += tag.length;
        if (closeStack.length === 0) {
          return input.slice(startIndex, cursor);
        }
        continue;
      }

      cursor += tag.length;
      continue;
    }

    cursor += tag.length;
  }

  return null;
}

function splitIntoGrokProtectedChunks(text: string): SplitChunk[] {
  const chunks: SplitChunk[] = [];
  let cursor = 0;
  let currentText = '';

  const pushCurrentText = () => {
    if (!currentText) {
      return;
    }

    chunks.push({
      canSplit: true,
      text: currentText,
    });
    currentText = '';
  };

  while (cursor < text.length) {
    const protectedChunk = readProtectedGrokWrappingChunk(text, cursor);
    if (protectedChunk) {
      pushCurrentText();
      chunks.push({
        canSplit: false,
        text: protectedChunk,
      });
      cursor += protectedChunk.length;
      continue;
    }

    currentText += text[cursor] ?? '';
    cursor += 1;
  }

  pushCurrentText();
  return chunks;
}

function splitPlainTextIntoUnits(text: string): string[] {
  const trimmedText = text.trim();
  if (!trimmedText) {
    return [];
  }

  const sentenceLikeChunks =
    trimmedText
      .match(/[^.!?]+[.!?]*/g)
      ?.map((chunk) => chunk.trim())
      .filter(Boolean) ?? [];

  const units: string[] = [];

  for (const sentence of sentenceLikeChunks) {
    if (sentence.length <= SPLIT_SEGMENT_MAX_LENGTH) {
      units.push(sentence);
      continue;
    }

    let remaining = sentence;
    while (remaining.length > SPLIT_SEGMENT_MAX_LENGTH) {
      units.push(remaining.slice(0, SPLIT_SEGMENT_MAX_LENGTH).trim());
      remaining = remaining.slice(SPLIT_SEGMENT_MAX_LENGTH).trim();
    }

    if (remaining) {
      units.push(remaining);
    }
  }

  return units;
}

function splitPlainTextIntoSegments(text: string): string[] {
  const segments: string[] = [];
  let currentSegment = '';

  const pushCurrentSegment = () => {
    const cleaned = currentSegment.trim();
    if (cleaned) {
      segments.push(cleaned);
    }
    currentSegment = '';
  };

  for (const unit of splitPlainTextIntoUnits(text)) {
    const candidate = currentSegment
      ? `${currentSegment} ${unit}`.trim()
      : unit;

    if (candidate.length <= SPLIT_SEGMENT_MAX_LENGTH) {
      currentSegment = candidate;
      continue;
    }

    pushCurrentSegment();
    currentSegment = unit;
  }

  pushCurrentSegment();
  return segments;
}

export function splitLongTextIntoSegments(
  text: string,
  options: SplitLongTextOptions = {},
): string[] {
  if (!options.preserveGrokWrappingTags) {
    return splitPlainTextIntoSegments(text);
  }

  const trimmedText = text.trim();
  if (!trimmedText) {
    return [];
  }

  const segments: string[] = [];
  let currentSegment = '';

  const pushCurrentSegment = () => {
    const cleaned = currentSegment.trim();
    if (cleaned) {
      segments.push(cleaned);
    }
    currentSegment = '';
  };

  for (const chunk of splitIntoGrokProtectedChunks(trimmedText)) {
    if (chunk.canSplit) {
      for (const segment of splitPlainTextIntoUnits(chunk.text)) {
        const candidate = currentSegment
          ? `${currentSegment} ${segment}`.trim()
          : segment;

        if (candidate.length <= SPLIT_SEGMENT_MAX_LENGTH) {
          currentSegment = candidate;
        } else {
          pushCurrentSegment();
          currentSegment = segment;
        }
      }
      continue;
    }

    const protectedText = chunk.text.trim();
    if (!protectedText) {
      continue;
    }

    const candidate = currentSegment
      ? `${currentSegment} ${protectedText}`.trim()
      : protectedText;

    if (candidate.length <= SPLIT_SEGMENT_MAX_LENGTH) {
      currentSegment = candidate;
      continue;
    }

    pushCurrentSegment();
    currentSegment = protectedText;
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
