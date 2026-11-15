import type { ReactNode } from 'react';

import { TAG_CHIP_CLASS, type TagProvider } from './catalog';
import { parseTaggedText, type TagToken } from './text';

function renderToken(
  token: TagToken,
  key: string,
  className: string,
): ReactNode {
  if (token.type === 'text') {
    return <span key={key}>{token.value}</span>;
  }

  if (token.type === 'instant-tag') {
    return (
      <span className={className} key={key}>
        {token.tag}
      </span>
    );
  }

  if (token.type === 'wrapper-open-tag') {
    return (
      <span className={className} key={key}>
        {token.openTag}
      </span>
    );
  }

  return (
    <span key={key}>
      <span className={className}>{token.openTag}</span>{' '}
      {token.children.map((child, index) =>
        renderToken(child, `${key}.${index}`, className),
      )}{' '}
      <span className={className}>{token.closeTag}</span>
    </span>
  );
}

/** Read-only speech text with its known tags as chips. */
export function TaggedText({
  className = TAG_CHIP_CLASS,
  provider = 'grok',
  text,
}: {
  /** Chip classes, for surfaces with their own palette. */
  className?: string;
  provider?: TagProvider;
  text: string;
}) {
  return parseTaggedText(text, provider).map((token, index) =>
    renderToken(token, `${index}`, className),
  );
}
