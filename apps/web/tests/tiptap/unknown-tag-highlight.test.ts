// @vitest-environment jsdom
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { describe, expect, it } from 'vitest';

import { UnknownTagHighlight } from '@/components/speech-tags/unknown-tag-highlight';

const UNSUPPORTED_GROK_TAG_HIGHLIGHT_CLASSES = [
  'rounded',
  'bg-red-950',
  'px-0.5',
  'text-red-100',
] as const;

function getHighlightedTags(editor: Editor) {
  return Array.from(editor.view.dom.querySelectorAll('span'))
    .filter((element) =>
      UNSUPPORTED_GROK_TAG_HIGHLIGHT_CLASSES.every((className) =>
        element.classList.contains(className),
      ),
    )
    .map((element) => element.textContent);
}

describe('UnknownTagHighlight', () => {
  it('refreshes the edited paragraph without disturbing other highlights', () => {
    const firstTag = '[first]';
    const editor = new Editor({
      content: `<p>${firstTag}</p><p>[second]</p>`,
      extensions: [StarterKit, UnknownTagHighlight],
    });

    expect(getHighlightedTags(editor)).toEqual([firstTag, '[second]']);

    const firstTextPosition = 1;
    const closingBracketPosition = firstTextPosition + firstTag.length - 1;
    editor.commands.deleteRange({
      from: closingBracketPosition,
      to: closingBracketPosition + 1,
    });

    expect(editor.getText({ blockSeparator: '\n' })).toBe('[first\n[second]');
    expect(getHighlightedTags(editor)).toEqual(['[second]']);

    editor.commands.insertContentAt(closingBracketPosition, ']');

    expect(getHighlightedTags(editor)).toEqual([firstTag, '[second]']);

    editor.destroy();
  });
});
