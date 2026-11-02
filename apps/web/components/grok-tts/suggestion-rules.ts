import type { EditorState } from '@tiptap/pm/state';
import type { Editor, Range } from '@tiptap/react';

import { GROK_WRAPPING_TAGS } from '@/lib/tts-editor';

const WRAPPER_OPEN_TAGS = GROK_WRAPPING_TAGS.map(([openTag]) => openTag);

function isResolvableDocPosition(position: number, docSize: number) {
  return Number.isInteger(position) && position >= 0 && position <= docSize;
}

export function isGrokWrapperSuggestionAllowed({
  editor,
  range,
  state,
}: {
  editor: Editor;
  range: Range;
  state: EditorState;
}) {
  if (editor.isDestroyed) {
    return false;
  }

  const { doc } = state;
  const docSize = doc.content.size;

  if (!isResolvableDocPosition(range.to, docSize)) {
    return false;
  }

  const resolvedPosition = doc.resolve(range.to);
  const nodeAfter = resolvedPosition.nodeAfter;
  const nextText = nodeAfter?.isText ? (nodeAfter.text ?? '') : '';
  const previousNode = resolvedPosition.nodeBefore;
  const previousText = previousNode?.isText ? (previousNode.text ?? '') : '';
  const combinedTagText = `${previousText}${nextText}`;

  return !WRAPPER_OPEN_TAGS.some((tag) => {
    const partialOpenTag = tag.slice(1);
    return (
      combinedTagText.startsWith(partialOpenTag) ||
      combinedTagText.startsWith(tag)
    );
  });
}
