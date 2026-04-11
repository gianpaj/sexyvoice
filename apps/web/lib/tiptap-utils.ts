import type { Node as PMNode } from '@tiptap/pm/model';
import { NodeSelection } from '@tiptap/pm/state';
import type { Editor } from '@tiptap/react';

/**
 * Utility for joining class names.
 */
export function cn(
  ...classes: (string | boolean | undefined | null)[]
): string {
  return classes.filter(Boolean).join(' ');
}

const MAC_SYMBOLS: Record<string, string> = {
  mod: '⌘',
  command: '⌘',
  meta: '⌘',
  ctrl: '⌃',
  control: '⌃',
  alt: '⌥',
  option: '⌥',
  shift: '⇧',
  backspace: 'Del',
  delete: '⌦',
  enter: '⏎',
  escape: '⎋',
  capslock: '⇪',
} as const;

function isMac(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    navigator.platform.toLowerCase().includes('mac')
  );
}

const formatShortcutKey = (
  key: string,
  isMacPlatform: boolean,
  capitalize = true,
) => {
  if (isMacPlatform) {
    const lowerKey = key.toLowerCase();
    return MAC_SYMBOLS[lowerKey] || (capitalize ? key.toUpperCase() : key);
  }

  return capitalize ? key.charAt(0).toUpperCase() + key.slice(1) : key;
};

/**
 * Parses a shortcut key string into an array of formatted key symbols.
 */
export const parseShortcutKeys = (props: {
  shortcutKeys: string | undefined;
  delimiter?: string;
  capitalize?: boolean;
}) => {
  const { shortcutKeys, delimiter = '+', capitalize = true } = props;

  if (!shortcutKeys) return [];

  return shortcutKeys
    .split(delimiter)
    .map((key) => key.trim())
    .map((key) => formatShortcutKey(key, isMac(), capitalize));
};

/**
 * Checks if a node exists in the editor schema.
 */
export const isNodeInSchema = (
  nodeName: string,
  editor: Editor | null,
): boolean => {
  if (!editor?.schema) return false;
  return editor.schema.spec.nodes.get(nodeName) !== undefined;
};

/**
 * Checks if a value is a valid number (not null, undefined, or NaN).
 */
export function isValidPosition(pos: number | null | undefined): pos is number {
  return typeof pos === 'number' && pos >= 0;
}

function findNodeAtPosition(editor: Editor, position: number) {
  try {
    const node = editor.state.doc.nodeAt(position);
    if (!node) {
      console.warn(`No node found at position ${position}`);
      return null;
    }
    return node;
  } catch (error) {
    console.error(`Error getting node at position ${position}:`, error);
    return null;
  }
}

/**
 * Finds the position and instance of a node in the document.
 */
export function findNodePosition(props: {
  editor: Editor | null;
  node?: PMNode | null;
  nodePos?: number | null;
}): { pos: number; node: PMNode } | null {
  const { editor, node, nodePos } = props;

  if (!(editor && editor.state?.doc)) return null;

  const hasValidNode = node !== undefined && node !== null;
  const hasValidPos = isValidPosition(nodePos);

  if (!(hasValidNode || hasValidPos)) {
    return null;
  }

  if (hasValidNode) {
    let foundPos = -1;
    let foundNode: PMNode | null = null;

    editor.state.doc.descendants((currentNode, pos) => {
      if (currentNode === node) {
        foundPos = pos;
        foundNode = currentNode;
        return false;
      }
      return true;
    });

    if (foundPos !== -1 && foundNode !== null) {
      return { pos: foundPos, node: foundNode };
    }
  }

  if (hasValidPos) {
    const nodeAtPos = findNodeAtPosition(editor, nodePos!);
    if (nodeAtPos) {
      return { pos: nodePos!, node: nodeAtPos };
    }
  }

  return null;
}

/**
 * Determines whether the current selection contains a node whose type matches
 * any of the provided node type names.
 */
export function isNodeTypeSelected(
  editor: Editor | null,
  nodeTypeNames: string[] = [],
  checkAncestorNodes = false,
): boolean {
  if (!(editor && editor.state.selection)) return false;

  const { selection } = editor.state;
  if (selection.empty) return false;

  if (selection instanceof NodeSelection) {
    const selectedNode = selection.node;
    return selectedNode
      ? nodeTypeNames.includes(selectedNode.type.name)
      : false;
  }

  if (checkAncestorNodes) {
    const { $from } = selection;
    for (let depth = $from.depth; depth > 0; depth--) {
      const ancestorNode = $from.node(depth);
      if (nodeTypeNames.includes(ancestorNode.type.name)) {
        return true;
      }
    }
  }

  return false;
}

type OverflowPosition = 'none' | 'top' | 'bottom' | 'both';

/**
 * Determines how a target element overflows relative to a container element.
 */
export function getElementOverflowPosition(
  targetElement: Element,
  containerElement: HTMLElement,
): OverflowPosition {
  const targetBounds = targetElement.getBoundingClientRect();
  const containerBounds = containerElement.getBoundingClientRect();

  const isOverflowingTop = targetBounds.top < containerBounds.top;
  const isOverflowingBottom = targetBounds.bottom > containerBounds.bottom;

  if (isOverflowingTop && isOverflowingBottom) return 'both';
  if (isOverflowingTop) return 'top';
  if (isOverflowingBottom) return 'bottom';
  return 'none';
}
