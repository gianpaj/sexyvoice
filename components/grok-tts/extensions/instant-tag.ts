import { mergeAttributes, Node } from '@tiptap/core';

import { type GrokInstantTag, getGrokInstantTags } from '@/lib/tts-editor';

const INSTANT_TAGS = new Set(getGrokInstantTags());
export const GROK_TAG_CHIP_CLASS =
  'inline-flex rounded bg-muted px-1 py-0.5 font-mono text-xs text-foreground';

function isGrokInstantTag(tag: string): tag is GrokInstantTag {
  return INSTANT_TAGS.has(tag as GrokInstantTag);
}

export const InstantTag = Node.create({
  addAttributes() {
    return {
      tag: {
        default: '[pause]',
      },
    };
  },

  group: 'inline',

  inline: true,

  marks: '_',

  atom: true,

  name: 'instantTag',

  parseHTML() {
    return [
      {
        tag: 'span[data-grok-instant-tag]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-grok-instant-tag': '',
        class: GROK_TAG_CHIP_CLASS,
        contenteditable: 'false',
      }),
      HTMLAttributes.tag,
    ];
  },

  renderText({ node }) {
    const tag = node.attrs.tag;

    return typeof tag === 'string' && isGrokInstantTag(tag) ? tag : '';
  },
});

export function createInstantTagNode(tag: GrokInstantTag) {
  return {
    attrs: {
      tag,
    },
    type: 'instantTag',
  } as const;
}
