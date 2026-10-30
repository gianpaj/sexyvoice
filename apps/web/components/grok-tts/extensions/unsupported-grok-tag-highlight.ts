import { Decoration, type Editor, Extension } from '@tiptap/core';

import { isKnownTtsTag, type TtsEditorProvider } from '@/lib/tts-editor';

const UNSUPPORTED_GROK_TAG_HIGHLIGHT_CLASS =
  'rounded bg-red-950 px-0.5 text-red-100';

const BRACKET_TAG_REGEX = /\[[a-z][a-z -]*(?:=[a-z-]+)?\]/gi;
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
  provider: TtsEditorProvider,
) {
  regex.lastIndex = 0;

  for (const match of text.matchAll(regex)) {
    const value = match[0];
    const index = match.index;

    if (!(value && typeof index === 'number')) {
      continue;
    }

    if (isKnownTtsTag(value, provider)) {
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
  provider: TtsEditorProvider = 'grok',
): UnsupportedGrokTagMatch[] {
  const matches: UnsupportedGrokTagMatch[] = [];

  collectMatches(text, BRACKET_TAG_REGEX, matches, provider);
  collectMatches(text, ANGLE_TAG_REGEX, matches, provider);

  return matches.sort((a, b) => a.start - b.start);
}

function createUnsupportedGrokTagDecorations(
  state: Editor['state'],
  from: number,
  to: number,
  provider: TtsEditorProvider,
) {
  const decorations: Decoration[] = [];

  state.doc.nodesBetween(from, to, (node, pos) => {
    if (!(node.isText && node.text)) {
      return;
    }

    const matches = findUnsupportedGrokTagMatches(node.text, provider);

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

export const UnsupportedGrokTagHighlight = Extension.create<{
  provider: TtsEditorProvider;
}>({
  addOptions() {
    return { provider: 'grok' };
  },
  addDecorations() {
    const provider = this.options.provider;
    return {
      create: ({ state }) =>
        createUnsupportedGrokTagDecorations(
          state,
          0,
          state.doc.content.size,
          provider,
        ),
      createInRange: ({ state, from, to }) =>
        createUnsupportedGrokTagDecorations(state, from, to, provider),
      update: 'changedRanges',
    };
  },

  name: 'unsupportedGrokTagHighlight',
});
