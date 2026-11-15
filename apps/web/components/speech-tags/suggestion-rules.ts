import type { EditorState } from '@tiptap/pm/state';
import type { Editor, Range } from '@tiptap/react';

import { TAG_CATALOGS, type TagProvider } from './catalog';

function isResolvableDocPosition(position: number, docSize: number) {
  return Number.isInteger(position) && position >= 0 && position <= docSize;
}

/**
 * The wrapper menu stays closed while the caret sits inside a wrapper tag
 * being typed, such as after `<so` of `<soft>`.
 */
export function isWrapperSuggestionAllowed({
  editor,
  provider,
  range,
  state,
}: {
  editor: Editor;
  provider: TagProvider;
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

  return !TAG_CATALOGS[provider].wrappers.some(([tag]) => {
    const partialOpenTag = tag.slice(1);
    return (
      combinedTagText.startsWith(partialOpenTag) ||
      combinedTagText.startsWith(tag)
    );
  });
}
