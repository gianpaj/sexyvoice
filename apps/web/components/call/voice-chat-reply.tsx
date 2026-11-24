'use client';

import { useReducedMotion } from 'motion/react';
import { lazy, memo, Suspense } from 'react';
import Markdown from 'react-markdown';
import remend from 'remend';

const StreamingReply = lazy(() => import('./voice-chat-streaming-reply'));
const markdownOptions = {
  // Streamdown uses this element internally for the word fade.
  allowedElements: [
    'p',
    'strong',
    'em',
    'br',
    'ol',
    'ul',
    'li',
    'streamdown-tail',
  ],
  skipHtml: true,
  unwrapDisallowed: true,
};
const repairOptions = {
  htmlTags: false,
  images: false,
  katex: false,
  links: false,
};

function ReplyMarkdown({ text, partial }: { text: string; partial: boolean }) {
  return (
    <Markdown {...markdownOptions}>
      {partial ? remend(text, repairOptions) : text}
    </Markdown>
  );
}

export const VoiceChatReply = memo(function VoiceChatReply({
  text,
  paced,
  streaming = false,
}: {
  text: string;
  paced: boolean;
  streaming?: boolean;
}) {
  if (!paced) return <ReplyMarkdown partial={streaming} text={text} />;
  return <PacedReply streaming={streaming} text={text} />;
});

const wordSegmenter =
  typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter(undefined, { granularity: 'word' })
    : null;

function revealStart(text: string) {
  let words = 0;
  for (const { index, isWordLike } of wordSegmenter?.segment(text) ?? []) {
    if (isWordLike && ++words === 7) return index;
  }
  return text.length;
}

function PacedReply({ text, streaming }: { text: string; streaming: boolean }) {
  const reduceMotion = useReducedMotion();
  const start = reduceMotion ? text.length : revealStart(text);
  if (start === text.length) {
    return <ReplyMarkdown partial={streaming} text={text} />;
  }

  const initialContent = text.slice(0, start).trimEnd();
  return (
    <Suspense fallback={<ReplyMarkdown partial text={initialContent} />}>
      <StreamingReply
        {...markdownOptions}
        content={text}
        initialContent={initialContent}
        remend={repairOptions}
      />
    </Suspense>
  );
}
