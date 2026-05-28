import type { ReactNode } from 'react';

import { type GrokEditorToken, parseGrokTtsText } from '@/lib/tts-editor';

const GROK_TAG_CHIP_CLASS =
  'inline-flex rounded bg-gray-700 px-1 py-0.5 font-mono text-xs text-foreground';

function renderGrokToken(
  token: GrokEditorToken,
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
        renderGrokToken(child, `${key}.${index}`, className),
      )}{' '}
      <span className={className}>{token.closeTag}</span>
    </span>
  );
}

interface GrokTaggedTextProps {
  className?: string;
  text: string;
}

export function GrokTaggedText({
  text,
  className = GROK_TAG_CHIP_CLASS,
}: GrokTaggedTextProps) {
  const tokens: GrokEditorToken[] = parseGrokTtsText(text).tokens;

  return tokens.map((token, index) =>
    renderGrokToken(token, `${index}`, className),
  );
}
