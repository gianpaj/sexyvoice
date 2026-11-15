import { mergeAttributes, Node } from '@tiptap/core';

import { TAG_CHIP_CLASS } from './catalog';

/** One end of a wrapper tag, rendered as a chip the caret cannot enter. */
export const WrapperBoundary = Node.create({
  addAttributes() {
    return {
      closeTag: { default: null },
      kind: { default: 'open' },
      openTag: { default: null },
    };
  },

  atom: true,

  group: 'inline',

  inline: true,

  marks: '',

  name: 'wrapperBoundary',

  renderText({ node }) {
    return node.attrs.kind === 'open'
      ? node.attrs.openTag
      : node.attrs.closeTag;
  },

  parseHTML() {
    return [
      {
        getAttrs: (element) => {
          if (!(element instanceof HTMLElement)) {
            return false;
          }

          const openTag = element.dataset.wrapperOpenTag;
          const closeTag = element.dataset.wrapperCloseTag;
          const kind = element.dataset.wrapperBoundaryKind;

          if (!(openTag && closeTag && (kind === 'open' || kind === 'close'))) {
            return false;
          }

          return {
            closeTag,
            kind,
            openTag,
          };
        },
        tag: 'span[data-wrapper-boundary]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const { closeTag, kind, openTag, ...rest } = HTMLAttributes as {
      closeTag?: string;
      kind?: string;
      openTag?: string;
    } & Record<string, unknown>;
    return [
      'span',
      mergeAttributes(rest, {
        class: TAG_CHIP_CLASS,
        contenteditable: 'false',
        'data-wrapper-boundary': '',
        'data-wrapper-boundary-kind': kind,
        'data-wrapper-close-tag': closeTag,
        'data-wrapper-open-tag': openTag,
      }),
      (kind === 'open' ? openTag : closeTag) ?? '',
    ];
  },
});
