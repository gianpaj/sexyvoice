'use client';

import { useReducedMotion } from 'motion/react';
import { useEffect, useEffectEvent, useMemo, useState } from 'react';

interface ReplyPart {
  tag?: 'strong' | 'em';
  text: string;
}

const emphasis = /\\\*|(?<!\*)(\*{1,2})(?![\s*])([^*\r\n]+?)(?<!\s)\1(?!\*)/gu;
const openEmphasis = /(?<![\\*])(\*{1,2})(?!\*)(?=\S|$)([^*\r\n]*)\*?$/u;

function parseEmphasis(text: string, streaming: boolean): ReplyPart[] {
  const parts: ReplyPart[] = [];
  let offset = 0;

  for (const match of text.matchAll(emphasis)) {
    const [raw, marker, content] = match;
    if (match.index > offset)
      parts.push({ text: text.slice(offset, match.index) });
    parts.push(
      marker
        ? { text: content, tag: marker.length === 2 ? 'strong' : 'em' }
        : { text: '*' },
    );
    offset = match.index + raw.length;
  }

  const tail = text.slice(offset);
  // An open marker can arrive before its closing marker in the next chunk.
  const open = streaming ? openEmphasis.exec(tail) : null;
  if (open) {
    parts.push({ text: tail.slice(0, open.index) });
    parts.push({ text: open[2], tag: open[1].length === 2 ? 'strong' : 'em' });
  } else if (tail) {
    parts.push({ text: tail });
  }

  return parts;
}

function renderParts(
  parts: ReplyPart[],
  visibleThrough = Number.POSITIVE_INFINITY,
) {
  let offset = 0;
  return parts.map(({ text, tag: Tag }) => {
    const start = offset;
    offset += text.length;
    const visible = text.slice(0, Math.max(0, visibleThrough - start));
    return Tag && visible ? <Tag key={start}>{visible}</Tag> : visible;
  });
}

export function VoiceChatReply({
  text,
  paced,
  streaming = false,
}: {
  text: string;
  paced: boolean;
  streaming?: boolean;
}) {
  const parts = useMemo(
    () => parseEmphasis(text, streaming),
    [text, streaming],
  );
  return paced ? <PacedReply parts={parts} /> : renderParts(parts);
}

const REVEAL_INTERVAL_MS = 80;
const REVEAL_WINDOW_MS = 960;
const wordSegmenter =
  typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter(undefined, { granularity: 'word' })
    : null;

function PacedReply({ parts }: { parts: ReplyPart[] }) {
  const text = parts.map((part) => part.text).join('');
  const reduceMotion = useReducedMotion();
  const wordStarts = useMemo(
    () =>
      Array.from(wordSegmenter?.segment(text) ?? []).flatMap(
        ({ index, isWordLike }) => (isWordLike ? [index] : []),
      ),
    [text],
  );
  const [shownWords, setShownWords] = useState(6);
  const hasBacklog = shownWords < wordStarts.length;

  const revealBatch = useEffectEvent((deadline: number) => {
    const stepsLeft = Math.max(
      1,
      Math.ceil((deadline - performance.now()) / REVEAL_INTERVAL_MS),
    );
    setShownWords((shown) => {
      const remaining = Math.max(0, wordStarts.length - shown);
      const batch = Math.max(3, Math.ceil(remaining / stepsLeft));
      return shown + Math.min(remaining, batch);
    });
  });

  useEffect(() => {
    if (reduceMotion || !hasBacklog) return;
    const deadline = performance.now() + REVEAL_WINDOW_MS;
    const timer = setInterval(() => revealBatch(deadline), REVEAL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [hasBacklog, reduceMotion]);

  return renderParts(parts, reduceMotion ? undefined : wordStarts[shownWords]);
}
