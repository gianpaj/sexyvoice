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
  alt: '⌥',
  backspace: 'Del',
  capslock: '⇪',
  command: '⌘',
  control: '⌃',
  ctrl: '⌃',
  delete: '⌦',
  enter: '⏎',
  escape: '⎋',
  meta: '⌘',
  mod: '⌘',
  option: '⌥',
  shift: '⇧',
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
