'use client';

import { Streamdown } from '@lobehub/streamdown';
import { type ComponentProps, useEffect, useMemo, useState } from 'react';

// Silky skips smoothing on appends over 100 characters. Feed bursts in
// smaller chunks so that a single SSE event can still reveal gradually.
const CHUNK_SIZE = 80;
const CHUNK_INTERVAL_MS = 64;

export default function StreamingReply({
  content,
  initialContent,
  ...markdownOptions
}: Omit<ComponentProps<typeof Streamdown>, 'granularity' | 'smoothing'> & {
  initialContent: string;
}) {
  const chars = useMemo(() => Array.from(content), [content]);
  const [fedChars, setFedChars] = useState(
    () => Array.from(initialContent).length,
  );
  const hasBacklog = fedChars < chars.length;

  useEffect(() => {
    if (!hasBacklog) return;
    const timer = setTimeout(
      () => setFedChars(fedChars + CHUNK_SIZE),
      CHUNK_INTERVAL_MS,
    );
    return () => clearTimeout(timer);
  }, [fedChars, hasBacklog]);

  return (
    <Streamdown
      {...markdownOptions}
      content={hasBacklog ? chars.slice(0, fedChars).join('') : content}
      granularity="word"
      smoothing="silky"
    />
  );
}
