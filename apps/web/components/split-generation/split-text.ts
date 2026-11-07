import type { TagProvider } from '@/components/speech-tags/catalog';
import {
  parseTaggedText,
  serializeTokens,
} from '@/components/speech-tags/text';
import { TTS_MODELS } from '@/lib/tts/models';

/** Every segment fits each model's paid request limit; split mode is paid. */
export const SPLIT_SEGMENT_MAX_LENGTH = Math.min(
  ...Object.values(TTS_MODELS).map((model) => model.textLimit.paid),
);
export const SPLIT_SEGMENT_MAX_COUNT = 20;

interface SplitLongTextOptions {
  /** Keeps this catalog's wrapper tags whole with their text. */
  provider?: TagProvider;
}

interface SplitChunk {
  canSplit: boolean;
  text: string;
}

/** Closed wrapper tags with their text cannot be cut; the rest can. */
function splitIntoProtectedChunks(
  text: string,
  provider: TagProvider,
): SplitChunk[] {
  const chunks: SplitChunk[] = [];
  for (const token of parseTaggedText(text, provider)) {
    const canSplit = token.type !== 'wrapper-tag';
    const tokenText = serializeTokens([token]);
    const previous = chunks.at(-1);
    if (canSplit && previous?.canSplit) {
      previous.text += tokenText;
    } else {
      chunks.push({ canSplit, text: tokenText });
    }
  }
  return chunks;
}

// Inline tags such as `<short pause>` or `[speaking slowly]` can contain
// spaces. A cut inside one leaves each half as plain text, which the provider
// reads aloud.
const INLINE_TAG_PATTERN = /<[^<>\s][^<>\n]{0,40}>|\[[^[\]\s][^[\]\n]{0,40}\]/g;

function getInlineTagSpans(text: string): [start: number, end: number][] {
  return [...text.matchAll(INLINE_TAG_PATTERN)].map((match) => [
    match.index,
    match.index + match[0].length,
  ]);
}

function getHardSplitIndex(text: string): number {
  const tagSpans = getInlineTagSpans(text);
  const isInsideTag = (index: number) =>
    tagSpans.some(([start, end]) => index > start && index < end);

  const splitWindow = text.slice(0, SPLIT_SEGMENT_MAX_LENGTH + 1);
  const whitespaceMatches = [...splitWindow.matchAll(/\s+/g)];
  const lastWhitespaceIndex = whitespaceMatches
    .map((match) => match.index ?? -1)
    .filter(
      (index) =>
        index > 0 && index <= SPLIT_SEGMENT_MAX_LENGTH && !isInsideTag(index),
    )
    .at(-1);
  if (lastWhitespaceIndex !== undefined) {
    return lastWhitespaceIndex;
  }

  // No usable whitespace: cut before a tag that crosses the limit.
  const crossingTag = tagSpans.find(
    ([start, end]) =>
      start > 0 &&
      start < SPLIT_SEGMENT_MAX_LENGTH &&
      end > SPLIT_SEGMENT_MAX_LENGTH,
  );
  return crossingTag?.[0] ?? SPLIT_SEGMENT_MAX_LENGTH;
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
      const splitIndex = getHardSplitIndex(remaining);
      units.push(remaining.slice(0, splitIndex).trim());
      remaining = remaining.slice(splitIndex).trim();
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
  if (!options.provider) {
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

  for (const chunk of splitIntoProtectedChunks(trimmedText, options.provider)) {
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
