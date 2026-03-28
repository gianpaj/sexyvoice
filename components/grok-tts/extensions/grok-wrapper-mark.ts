import { Mark, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

import { GROK_TAG_CHIP_CLASS } from '@/components/grok-tts/extensions/instant-tag';
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

  inclusive: true,

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
        class: 'inline-block min-w-[0.75ch]',
      }),
      0,
    ];
  },

  addProseMirrorPlugins() {
    const pluginKey = new PluginKey('grokWrapperDecorations');

    return [
      new Plugin({
        key: pluginKey,
        props: {
          decorations: (state) => {
            const decorations: Decoration[] = [];

            state.doc.descendants((node, pos) => {
              if (node.type.name !== 'paragraph') {
                return;
              }

              const activeMarks: {
                closeTag: GrokWrapperCloseTag;
                openTag: GrokWrapperOpenTag;
              }[] = [];

              node.forEach((child, offset) => {
                const childPos = pos + 1 + offset;
                const nextMarks = child.marks
                  .filter((mark) => mark.type.name === 'grokWrapper')
                  .map((mark) => ({
                    closeTag: mark.attrs.closeTag as GrokWrapperCloseTag,
                    openTag: mark.attrs.openTag as GrokWrapperOpenTag,
                  }));
                let prefixLength = 0;

                while (
                  prefixLength < activeMarks.length &&
                  prefixLength < nextMarks.length &&
                  activeMarks[prefixLength]?.openTag ===
                    nextMarks[prefixLength]?.openTag &&
                  activeMarks[prefixLength]?.closeTag ===
                    nextMarks[prefixLength]?.closeTag
                ) {
                  prefixLength += 1;
                }

                for (
                  let index = activeMarks.length - 1;
                  index >= prefixLength;
                  index -= 1
                ) {
                  decorations.push(
                    Decoration.widget(
                      childPos,
                      () =>
                        createWrapperChip(
                          activeMarks[index]?.closeTag ?? '',
                          'close',
                        ),
                      { side: 1 },
                    ),
                  );
                }

                for (
                  let index = prefixLength;
                  index < nextMarks.length;
                  index += 1
                ) {
                  decorations.push(
                    Decoration.widget(
                      childPos,
                      () =>
                        createWrapperChip(
                          nextMarks[index]?.openTag ?? '',
                          'open',
                        ),
                      { side: -1 },
                    ),
                  );
                }

                activeMarks.splice(0, activeMarks.length, ...nextMarks);
              });

              const paragraphEnd = pos + node.nodeSize - 1;

              for (let index = activeMarks.length - 1; index >= 0; index -= 1) {
                decorations.push(
                  Decoration.widget(
                    paragraphEnd,
                    () =>
                      createWrapperChip(
                        activeMarks[index]?.closeTag ?? '',
                        'close',
                      ),
                    { side: 1 },
                  ),
                );
              }
            });

            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});

function createWrapperChip(tag: string, kind: 'close' | 'open') {
  const element = document.createElement('span');
  element.className = GROK_TAG_CHIP_CLASS;
  element.dataset.grokWrapperBoundary = kind;
  element.contentEditable = 'false';
  element.textContent = tag;

  return element;
}

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
