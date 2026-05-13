import type { ReactNode } from 'react';

import { type GrokEditorToken, parseGrokTtsText } from '@/lib/tts-editor';

export const GROK_TAG_CHIP_CLASS =
  'inline-flex rounded bg-gray-600 px-1 py-0.5 font-mono text-xs text-foreground';

function renderGrokToken(token: GrokEditorToken, key: string): ReactNode {
  if (token.type === 'text') {
    return <span key={key}>{token.value}</span>;
  }

  if (token.type === 'instant-tag') {
    return (
      <span className={GROK_TAG_CHIP_CLASS} key={key}>
        {token.tag}
      </span>
    );
  }

  if (token.type === 'wrapper-open-tag') {
    return (
      <span className={GROK_TAG_CHIP_CLASS} key={key}>
        {token.openTag}
      </span>
    );
  }

  return (
    <span key={key}>
      <span className={GROK_TAG_CHIP_CLASS}>{token.openTag}</span>
      {token.children.map((child, index) =>
        renderGrokToken(child, `${key}.${index}`),
      )}
      <span className={GROK_TAG_CHIP_CLASS}>{token.closeTag}</span>
    </span>
  );
}

interface GrokTaggedTextProps {
  text: string;
}

export function GrokTaggedText({ text }: GrokTaggedTextProps) {
  const tokens = parseGrokTtsText(text).tokens;

  return tokens.map((token, index) => renderGrokToken(token, `${index}`));
}
