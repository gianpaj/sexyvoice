import type { Node } from '@tiptap/pm/model';
import { NodeSelection } from '@tiptap/pm/state';
import type { Editor } from '@tiptap/react';

import { isValidPosition } from '@/lib/tiptap-utils';

/**
 * Gets the anchor node and its position in the editor.
 *
 * @param editor The Tiptap editor instance
 * @param allowEmptySelection If true, still returns the node at the cursor
 * position even if selection is empty
 * @returns An object containing the anchor node and its position, or null if
 * not found
 */
export function getAnchorNodeAndPos(
  editor: Editor | null,
  allowEmptySelection = true,
): { node: Node; pos: number } | null {
  if (!editor) return null;

  const { state } = editor;
  const { selection } = state;

  if (selection instanceof NodeSelection) {
    const node = selection.node;
    const pos = selection.from;

    if (node && isValidPosition(pos)) {
      return { node, pos };
    }
  }

  if (selection.empty && !allowEmptySelection) return null;

  const $anchor = selection.$anchor;
  const depth = 1;
  const node = $anchor.node(depth);
  const pos = $anchor.before(depth);

  return { node, pos };
}
