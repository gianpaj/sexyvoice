import { mergeAttributes, Node } from '@tiptap/core';

import { GROK_TAG_CHIP_CLASS } from '@/components/grok-tts/extensions/instant-tag';
import type {
  GrokWrapperBoundaryKind,
  GrokWrapperCloseTag,
  GrokWrapperOpenTag,
} from '@/lib/grok-tts-editor';

export const WrapperBoundary = Node.create({
  addAttributes() {
    return {
      closeTag: {
        default: '</soft>',
      },
      kind: {
        default: 'open',
      },
      openTag: {
        default: '<soft>',
      },
    };
  },

  group: 'inline',

  inline: true,

  atom: true,

  marks: '',

  name: 'wrapperBoundary',

  parseHTML() {
    return [
      {
        getAttrs: (element) => {
          if (!(element instanceof HTMLElement)) {
            return false;
          }

          const openTag = element.dataset.grokWrapperOpenTag;
          const closeTag = element.dataset.grokWrapperCloseTag;
          const kind = element.dataset.grokWrapperBoundaryKind;

          if (!(openTag && closeTag && (kind === 'open' || kind === 'close'))) {
            return false;
          }

          return {
            closeTag,
            kind,
            openTag,
          };
        },
        tag: 'span[data-grok-wrapper-boundary-node]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const {
      closeTag = '</soft>',
      kind = 'open',
      openTag = '<soft>',
      ...rest
    } = HTMLAttributes as {
      closeTag?: string;
      kind?: string;
      openTag?: string;
    } & Record<string, unknown>;
    const isOpen = kind === 'open';
    const text = isOpen ? openTag : closeTag;

    return [
      'span',
      mergeAttributes(rest, {
        'data-grok-wrapper-boundary-kind': kind,
        'data-grok-wrapper-boundary-node': '',
        'data-grok-wrapper-close-tag': closeTag,
        'data-grok-wrapper-open-tag': openTag,
        class: GROK_TAG_CHIP_CLASS,
        contenteditable: 'false',
      }),
      text,
    ];
  },
});

export function createWrapperBoundaryNode(
  kind: GrokWrapperBoundaryKind,
  openTag: GrokWrapperOpenTag,
  closeTag: GrokWrapperCloseTag,
) {
  return {
    attrs: {
      closeTag,
      kind,
      openTag,
    },
    type: 'wrapperBoundary',
  } as const;
}
