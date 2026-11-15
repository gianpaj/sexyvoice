import { Decoration, type Editor, Extension } from '@tiptap/core';

import type { TagProvider } from './catalog';
import { isKnownTag } from './text';

const UNKNOWN_TAG_HIGHLIGHT_CLASS = 'rounded bg-red-950 px-0.5 text-red-100';

// Tag-shaped text: `[word]`, `[name=value]`, `<word>` and `</word>`.
const BRACKET_TAG_REGEX = /\[[a-z][a-z -]*(?:=[a-z-]+)?\]/gi;
const ANGLE_TAG_REGEX = /<\/?[a-z-]+>/gi;

interface UnknownTagMatch {
  end: number;
  start: number;
  text: string;
}

function collectMatches(
  text: string,
  regex: RegExp,
  matches: UnknownTagMatch[],
  provider: TagProvider,
) {
  regex.lastIndex = 0;

  for (const match of text.matchAll(regex)) {
    const value = match[0];
    const index = match.index;

    if (!(value && typeof index === 'number')) {
      continue;
    }

    if (isKnownTag(value, provider)) {
      continue;
    }

    matches.push({
      end: index + value.length,
      start: index,
      text: value,
    });
  }
}

/** Tag-shaped text the provider's catalog does not know; it stays literal. */
export function findUnknownTagMatches(
  text: string,
  provider: TagProvider,
): UnknownTagMatch[] {
  const matches: UnknownTagMatch[] = [];

  collectMatches(text, BRACKET_TAG_REGEX, matches, provider);
  collectMatches(text, ANGLE_TAG_REGEX, matches, provider);

  return matches.sort((a, b) => a.start - b.start);
}

function createUnknownTagDecorations(
  state: Editor['state'],
  from: number,
  to: number,
  provider: TagProvider,
) {
  const decorations: Decoration[] = [];

  state.doc.nodesBetween(from, to, (node, pos) => {
    if (!(node.isText && node.text)) {
      return;
    }

    for (const match of findUnknownTagMatches(node.text, provider)) {
      decorations.push(
        Decoration.Inline(pos + match.start, pos + match.end, {
          class: UNKNOWN_TAG_HIGHLIGHT_CLASS,
        }),
      );
    }
  });

  return decorations;
}

export const UnknownTagHighlight = Extension.create<{
  provider: TagProvider;
}>({
  addOptions() {
    return { provider: 'grok' };
  },
  addDecorations() {
    const provider = this.options.provider;
    return {
      create: ({ state }) =>
        createUnknownTagDecorations(state, 0, state.doc.content.size, provider),
      createInRange: ({ state, from, to }) =>
        createUnknownTagDecorations(state, from, to, provider),
      update: 'changedRanges',
    };
  },

  name: 'unknownTagHighlight',
});
