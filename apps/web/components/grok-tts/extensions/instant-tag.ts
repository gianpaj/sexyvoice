import { mergeAttributes, Node } from '@tiptap/core';

import {
  GROK_TAG_CHIP_CLASS,
  isKnownTtsTag,
  type TtsEditorProvider,
  type TtsInstantTag,
} from '@/lib/tts-editor';

export const InstantTag = Node.create<{ provider: TtsEditorProvider }>({
  addOptions() {
    return { provider: 'grok' };
  },
  addAttributes() {
    return {
      tag: {
        default: '[pause]',
      },
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
        tag: 'span[data-grok-instant-tag]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        class: GROK_TAG_CHIP_CLASS,
        contenteditable: 'false',
        'data-grok-instant-tag': '',
      }),
      HTMLAttributes.tag,
    ];
  },

  renderText({ node }) {
    const tag = node.attrs.tag;

    return typeof tag === 'string' && isKnownTtsTag(tag, this.options.provider)
      ? tag
      : '';
  },
});

export function createInstantTagNode(tag: TtsInstantTag) {
  return {
    attrs: {
      tag,
    },
    type: 'instantTag',
  } as const;
}
