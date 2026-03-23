import { Mark, mergeAttributes } from '@tiptap/core';

import type {
  GrokWrapperCloseTag,
  GrokWrapperOpenTag,
} from '@/lib/grok-tts-editor';

export const GrokWrapperMark = Mark.create({
  addAttributes() {
    return {
      closeTag: {
        default: '</soft>',
      },
      openTag: {
        default: '<soft>',
      },
    };
  },

  inclusive: false,

  name: 'grokWrapper',

  parseHTML() {
    return [
      {
        tag: 'span[data-grok-wrapper]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-grok-wrapper': '',
        class:
          'rounded bg-accent/60 px-0.5 transition-colors data-[grok-wrapper=true]:bg-accent/60',
      }),
      0,
    ];
  },
});

export function createGrokWrapperMark(
  openTag: GrokWrapperOpenTag,
  closeTag: GrokWrapperCloseTag,
) {
  return {
    attrs: {
      closeTag,
      openTag,
    },
    type: 'grokWrapper',
  } as const;
}
