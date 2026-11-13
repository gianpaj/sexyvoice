import { mergeAttributes, Node } from '@tiptap/core';

import { TAG_CHIP_CLASS, type TagProvider } from './catalog';
import { isKnownTag } from './text';

/** A tag performed at one point, rendered as a chip. */
export const InstantTag = Node.create<{ provider: TagProvider }>({
  addOptions() {
    return { provider: 'grok' };
  },
  addAttributes() {
    return {
      tag: { default: null },
    };
  },

  atom: true,

  group: 'inline',

  inline: true,

  marks: '_',

  name: 'instantTag',

  parseHTML() {
    return [
      {
        tag: 'span[data-instant-tag]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        class: TAG_CHIP_CLASS,
        contenteditable: 'false',
        'data-instant-tag': '',
      }),
      HTMLAttributes.tag ?? '',
    ];
  },

  renderText({ node }) {
    const tag = node.attrs.tag;

    return typeof tag === 'string' && isKnownTag(tag, this.options.provider)
      ? tag
      : '';
  },
});

export function createInstantTagNode(tag: string) {
  return {
    attrs: {
      tag,
    },
    type: 'instantTag',
  } as const;
}
