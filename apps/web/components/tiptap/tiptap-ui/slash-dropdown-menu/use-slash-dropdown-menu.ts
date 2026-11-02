'use client';

import type { Editor } from '@tiptap/react';

import { TypeIcon } from '@/components/tiptap/tiptap-icons/type-icon';
// --- Tiptap UI ---
import type { SuggestionItem } from '@/components/tiptap/tiptap-ui-utils/suggestion-menu';
// --- Lib ---
import { isNodeInSchema } from '@/lib/tiptap-utils';

export interface SlashMenuConfig {
  customItems?: SuggestionItem[];
  enabledItems?: SlashMenuItemType[];
  itemGroups?: {
    [key in SlashMenuItemType]?: string;
  };
  showGroups?: boolean;
}

const texts = {
  // AI

  // Style
  text: {
    badge: TypeIcon,
    group: 'Style',
    keywords: ['p', 'paragraph', 'text'],
    subtext: 'Regular text paragraph',
    title: 'Text',
  },

  // Insert
};

export type SlashMenuItemType = keyof typeof texts;

const getItemImplementations = () => {
  return {
    // AI

    // Style
    text: {
      action: ({ editor }: { editor: Editor }) => {
        editor.chain().focus().setParagraph().run();
      },
      check: (editor: Editor) => isNodeInSchema('paragraph', editor),
    },
    // Insert

    // Upload
  };
};

function organizeItemsByGroups(
  items: SuggestionItem[],
  showGroups: boolean,
): SuggestionItem[] {
  if (!showGroups) {
    return items.map((item) => ({ ...item, group: '' }));
  }

  const groups: { [groupLabel: string]: SuggestionItem[] } = {};

  // Group items
  for (const item of items) {
    const groupLabel = item.group || '';
    if (!groups[groupLabel]) {
      groups[groupLabel] = [];
    }
    groups[groupLabel].push(item);
  }

  // Flatten groups in order (this maintains the visual order for keyboard navigation)
  const organizedItems: SuggestionItem[] = [];
  for (const [, groupItems] of Object.entries(groups)) {
    organizedItems.push(...groupItems);
  }

  return organizedItems;
}

/**
 * Custom hook for slash dropdown menu functionality
 */
export function useSlashDropdownMenu(config?: SlashMenuConfig) {
  const getSlashMenuItems = (editor: Editor) => {
    const items: SuggestionItem[] = [];

    const enabledItems =
      config?.enabledItems ?? (Object.keys(texts) as SlashMenuItemType[]);
    const showGroups = config?.showGroups !== false;

    const itemImplementations = getItemImplementations();

    for (const itemType of enabledItems) {
      const itemImpl = itemImplementations[itemType];
      const itemText = texts[itemType];

      if (itemImpl && itemText && itemImpl.check(editor)) {
        const item: SuggestionItem = {
          onSelect: ({ editor }) => itemImpl.action({ editor }),
          ...itemText,
        };

        if (config?.itemGroups?.[itemType]) {
          item.group = config.itemGroups[itemType];
        } else if (!showGroups) {
          item.group = '';
        }

        items.push(item);
      }
    }

    if (config?.customItems) {
      items.push(...config.customItems);
    }

    // Reorganize items by groups to ensure keyboard navigation works correctly
    return organizeItemsByGroups(items, showGroups);
  };

  return {
    config,
    getSlashMenuItems,
  };
}
