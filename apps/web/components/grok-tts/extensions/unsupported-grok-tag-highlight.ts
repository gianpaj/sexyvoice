import { Extension } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

import { isKnownGrokTag } from '@/lib/tts-editor';

const UNSUPPORTED_GROK_TAG_HIGHLIGHT_CLASS =
  'rounded bg-red-950 px-0.5 text-red-100';

const BRACKET_TAG_REGEX = /\[[a-z-]+\]/gi;
const ANGLE_TAG_REGEX = /<\/?[a-z-]+>/gi;

export interface UnsupportedGrokTagMatch {
  end: number;
  start: number;
  text: string;
}

function collectMatches(
  text: string,
  regex: RegExp,
  matches: UnsupportedGrokTagMatch[],
) {
  regex.lastIndex = 0;

  for (const match of text.matchAll(regex)) {
    const value = match[0];
    const index = match.index;

    if (!(value && typeof index === 'number')) {
      continue;
    }

    if (isKnownGrokTag(value)) {
      continue;
    }

    matches.push({
      end: index + value.length,
      start: index,
      text: value,
    });
  }
}

export function findUnsupportedGrokTagMatches(
  text: string,
): UnsupportedGrokTagMatch[] {
  const matches: UnsupportedGrokTagMatch[] = [];

  collectMatches(text, BRACKET_TAG_REGEX, matches);
  collectMatches(text, ANGLE_TAG_REGEX, matches);

  return matches.sort((a, b) => a.start - b.start);
}

function createUnsupportedGrokTagDecorations(doc: ProseMirrorNode) {
  const decorations: Decoration[] = [];

  doc.descendants((node, pos) => {
    if (!(node.isText && node.text)) {
      return;
    }

    const matches = findUnsupportedGrokTagMatches(node.text);

    for (const match of matches) {
      decorations.push(
        Decoration.inline(pos + match.start, pos + match.end, {
          class: UNSUPPORTED_GROK_TAG_HIGHLIGHT_CLASS,
        }),
      );
    }
  });

  return DecorationSet.create(doc, decorations);
}

export const UnsupportedGrokTagHighlight = Extension.create({
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('unsupportedGrokTagHighlight'),
        props: {
          decorations(state) {
            return createUnsupportedGrokTagDecorations(state.doc);
          },
        },
      }),
    ];
  },

  name: 'unsupportedGrokTagHighlight',
});
