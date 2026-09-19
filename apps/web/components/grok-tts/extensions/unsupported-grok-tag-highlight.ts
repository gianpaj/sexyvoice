import { Decoration, type Editor, Extension } from '@tiptap/core';

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

function createUnsupportedGrokTagDecorations(
  state: Editor['state'],
  from: number,
  to: number,
) {
  const decorations: Decoration[] = [];

  state.doc.nodesBetween(from, to, (node, pos) => {
    if (!(node.isText && node.text)) {
      return;
    }

    const matches = findUnsupportedGrokTagMatches(node.text);

    for (const match of matches) {
      const matchFrom = pos + match.start;

      decorations.push(
        Decoration.Inline(matchFrom, pos + match.end, {
          class: UNSUPPORTED_GROK_TAG_HIGHLIGHT_CLASS,
        }),
      );
    }
  });

  return decorations;
}

export const UnsupportedGrokTagHighlight = Extension.create({
  addDecorations() {
    return {
      create: ({ state }) =>
        createUnsupportedGrokTagDecorations(state, 0, state.doc.content.size),
      createInRange: ({ state, from, to }) =>
        createUnsupportedGrokTagDecorations(state, from, to),
      update: 'changedRanges',
    };
  },

  name: 'unsupportedGrokTagHighlight',
});
