import { describe, expect, it } from 'vitest';

import { EMPTY_WRAPPER_TEXT } from '@/components/speech-tags/catalog';
import {
  docToTaggedText,
  parseTaggedText,
  serializeTokens,
  type TagToken,
  taggedTextToDoc,
} from '@/components/speech-tags/text';
import { findUnknownTagMatches } from '@/components/speech-tags/unknown-tag-highlight';

function text(value: string): TagToken {
  return {
    type: 'text',
    value,
  };
}

function instant(tag: string): TagToken {
  return {
    tag,
    type: 'instant-tag',
  };
}

function wrapper(
  openTag: string,
  closeTag: string,
  children: TagToken[],
): TagToken {
  return {
    children,
    closeTag,
    openTag,
    type: 'wrapper-tag',
  };
}

describe('speech tag text', () => {
  describe('findUnknownTagMatches', () => {
    it('finds unsupported instant tags', () => {
      expect(
        findUnknownTagMatches('Hello [unknown-tag] world', 'grok'),
      ).toEqual([
        {
          end: 19,
          start: 6,
          text: '[unknown-tag]',
        },
      ]);
    });

    it('finds unsupported wrapping tags', () => {
      expect(findUnknownTagMatches('<mystery>Hello</mystery>', 'grok')).toEqual(
        [
          {
            end: 9,
            start: 0,
            text: '<mystery>',
          },
          {
            end: 24,
            start: 14,
            text: '</mystery>',
          },
        ],
      );
    });

    it('ignores supported Grok tags', () => {
      expect(
        findUnknownTagMatches('[pause] <soft>Hello</soft>', 'grok'),
      ).toEqual([]);
    });

    it('preserves malformed but tag-like text as unsupported matches only when complete', () => {
      expect(findUnknownTagMatches('[oops <oops', 'grok')).toEqual([]);
    });
  });

  describe('parseTaggedText', () => {
    it('returns a single text token for plain text', () => {
      expect(parseTaggedText('Hello world', 'grok')).toEqual([
        text('Hello world'),
      ]);
    });

    it('parses instant tags as structured tokens', () => {
      expect(parseTaggedText('Hello [laugh] world', 'grok')).toEqual([
        text('Hello '),
        instant('[laugh]'),
        text(' world'),
      ]);
    });

    it('parses wrapping tags with nested text', () => {
      expect(parseTaggedText('<soft>Hello</soft>', 'grok')).toEqual([
        wrapper('<soft>', '</soft>', [text('Hello')]),
      ]);
    });

    it('parses mixed text, instant tags, and wrapping tags', () => {
      expect(parseTaggedText('Hi [pause] <soft>there</soft>', 'grok')).toEqual([
        text('Hi '),
        instant('[pause]'),
        text(' '),
        wrapper('<soft>', '</soft>', [text('there')]),
      ]);
    });

    it('parses multiline content and preserves newline text nodes', () => {
      expect(parseTaggedText('Line one\n[laugh]\nLine two', 'grok')).toEqual([
        text('Line one\n'),
        instant('[laugh]'),
        text('\nLine two'),
      ]);
    });

    it('supports nested wrapping tags', () => {
      expect(
        parseTaggedText('<soft>Hello <fast>there</fast></soft>', 'grok'),
      ).toEqual([
        wrapper('<soft>', '</soft>', [
          text('Hello '),
          wrapper('<fast>', '</fast>', [text('there')]),
        ]),
      ]);
    });

    it('leaves unknown instant tags as plain text', () => {
      expect(parseTaggedText('Hello [unknown-tag] world', 'grok')).toEqual([
        text('Hello [unknown-tag] world'),
      ]);
    });

    it('leaves unknown wrapping tags as plain text', () => {
      expect(parseTaggedText('<mystery>Hello</mystery>', 'grok')).toEqual([
        text('<mystery>Hello</mystery>'),
      ]);
    });

    it('parses standalone opening wrapper tags as structured tokens', () => {
      expect(parseTaggedText('<soft>', 'grok')).toEqual([
        {
          closeTag: '</soft>',
          openTag: '<soft>',
          type: 'wrapper-open-tag',
        },
      ]);
      expect(parseTaggedText('<soft>Hello', 'grok')).toEqual([
        {
          closeTag: '</soft>',
          openTag: '<soft>',
          type: 'wrapper-open-tag',
        },
        text('Hello'),
      ]);
      expect(parseTaggedText('Hello</soft>', 'grok')).toEqual([
        text('Hello</soft>'),
      ]);
    });

    it('keeps mismatched closing wrapper tags as plain text after a standalone opening wrapper tag', () => {
      expect(parseTaggedText('<soft>Hello</fast>', 'grok')).toEqual([
        {
          closeTag: '</soft>',
          openTag: '<soft>',
          type: 'wrapper-open-tag',
        },
        text('Hello</fast>'),
      ]);
    });
  });

  describe('serializeTokens', () => {
    it('serializes plain text tokens back to text', () => {
      expect(serializeTokens([text('Hello world')])).toBe('Hello world');
    });

    it('serializes instant tags back to bracket syntax', () => {
      expect(
        serializeTokens([text('Hello '), instant('[laugh]'), text(' world')]),
      ).toBe('Hello [laugh] world');
    });

    it('serializes wrapping tags back to paired syntax', () => {
      expect(
        serializeTokens([wrapper('<soft>', '</soft>', [text('Hello')])]),
      ).toBe('<soft>Hello</soft>');
    });

    it('serializes standalone opening wrapper tags back to opening syntax', () => {
      expect(
        serializeTokens([
          {
            closeTag: '</soft>',
            openTag: '<soft>',
            type: 'wrapper-open-tag',
          },
        ]),
      ).toBe('<soft>');
    });

    it('serializes nested wrapping tags correctly', () => {
      expect(
        serializeTokens([
          wrapper('<soft>', '</soft>', [
            text('Hello '),
            wrapper('<fast>', '</fast>', [text('there')]),
          ]),
        ]),
      ).toBe('<soft>Hello <fast>there</fast></soft>');
    });

    it('serializes multiline token trees with preserved newlines', () => {
      expect(
        serializeTokens([
          text('Line one\n'),
          instant('[laugh]'),
          text('\nLine two'),
        ]),
      ).toBe('Line one\n[laugh]\nLine two');
    });
  });

  describe('round-trip invariants', () => {
    it('round-trips valid mixed Grok tag content', () => {
      const input =
        'Hello [laugh]\n<soft>Take it <fast>slowly</fast></soft>\n[breath]';
      const parsed = parseTaggedText(input, 'grok');

      expect(serializeTokens(parsed)).toBe(input);
    });

    it('round-trips valid nested wrapper content', () => {
      const input =
        '<soft>Hello <fast>there</fast> and <whisper>stay close</whisper></soft>';
      const parsed = parseTaggedText(input, 'grok');

      expect(serializeTokens(parsed)).toBe(input);
    });

    it('round-trips the singing wrapping tag', () => {
      const input = '<singing>La la la</singing>';
      const parsed = parseTaggedText(input, 'grok');

      expect(parsed).toEqual([
        wrapper('<singing>', '</singing>', [text('La la la')]),
      ]);
      expect(serializeTokens(parsed)).toBe(input);
    });

    it('preserves malformed content by keeping it as text', () => {
      const input = '<soft>Hello</fast> [unknown-tag]';
      const parsed = parseTaggedText(input, 'grok');

      expect(serializeTokens(parsed)).toBe(input);
    });

    it('round-trips unsupported tags as plain text', () => {
      const input = 'Hello [unknown-tag] <mystery>x</mystery>';

      expect(docToTaggedText(taggedTextToDoc(input, 'grok'), 'grok')).toBe(
        input,
      );
    });
  });

  describe('TipTap document conversion', () => {
    it('converts wrapping tags into wrapper boundary nodes', () => {
      expect(taggedTextToDoc('<soft>Hello</soft>', 'grok')).toEqual({
        content: [
          {
            content: [
              {
                attrs: {
                  closeTag: '</soft>',
                  kind: 'open',
                  openTag: '<soft>',
                },
                type: 'wrapperBoundary',
              },
              {
                text: 'Hello',
                type: 'text',
              },
              {
                attrs: {
                  closeTag: '</soft>',
                  kind: 'close',
                  openTag: '<soft>',
                },
                type: 'wrapperBoundary',
              },
            ],
            type: 'paragraph',
          },
        ],
        type: 'doc',
      });
    });

    it('converts standalone opening wrapper tags into a single opening boundary node', () => {
      expect(taggedTextToDoc('<soft>', 'grok')).toEqual({
        content: [
          {
            content: [
              {
                attrs: {
                  closeTag: '</soft>',
                  kind: 'open',
                  openTag: '<soft>',
                },
                type: 'wrapperBoundary',
              },
            ],
            type: 'paragraph',
          },
        ],
        type: 'doc',
      });
    });

    it('keeps empty wrapping tags as boundary nodes with placeholder text', () => {
      expect(taggedTextToDoc('<soft></soft>', 'grok')).toEqual({
        content: [
          {
            content: [
              {
                attrs: {
                  closeTag: '</soft>',
                  kind: 'open',
                  openTag: '<soft>',
                },
                type: 'wrapperBoundary',
              },
              {
                text: EMPTY_WRAPPER_TEXT,
                type: 'text',
              },
              {
                attrs: {
                  closeTag: '</soft>',
                  kind: 'close',
                  openTag: '<soft>',
                },
                type: 'wrapperBoundary',
              },
            ],
            type: 'paragraph',
          },
        ],
        type: 'doc',
      });
    });

    it('converts instant tags into inline instantTag nodes', () => {
      expect(taggedTextToDoc('Hello [pause]', 'grok')).toEqual({
        content: [
          {
            content: [
              {
                text: 'Hello ',
                type: 'text',
              },
              {
                attrs: {
                  tag: '[pause]',
                },
                type: 'instantTag',
              },
            ],
            type: 'paragraph',
          },
        ],
        type: 'doc',
      });
    });

    it('serializes wrapper boundaries and instant nodes back to Grok text', () => {
      expect(
        docToTaggedText(
          {
            content: [
              {
                content: [
                  {
                    attrs: {
                      closeTag: '</soft>',
                      kind: 'open',
                      openTag: '<soft>',
                    },
                    type: 'wrapperBoundary',
                  },
                  {
                    text: 'Hello ',
                    type: 'text',
                  },
                  {
                    attrs: {
                      tag: '[laugh]',
                    },
                    type: 'instantTag',
                  },
                  {
                    attrs: {
                      closeTag: '</soft>',
                      kind: 'close',
                      openTag: '<soft>',
                    },
                    type: 'wrapperBoundary',
                  },
                  {
                    text: 'there',
                    type: 'text',
                  },
                ],
                type: 'paragraph',
              },
            ],
            type: 'doc',
          },
          'grok',
        ),
      ).toBe('<soft>Hello [laugh]</soft>there');
    });

    it('serializes a standalone opening wrapper boundary back to opening tag text', () => {
      expect(
        docToTaggedText(
          {
            content: [
              {
                content: [
                  {
                    attrs: {
                      closeTag: '</soft>',
                      kind: 'open',
                      openTag: '<soft>',
                    },
                    type: 'wrapperBoundary',
                  },
                ],
                type: 'paragraph',
              },
            ],
            type: 'doc',
          },
          'grok',
        ),
      ).toBe('<soft>');
    });

    it('serializes empty wrapper placeholder text back to empty tags', () => {
      expect(
        docToTaggedText(
          {
            content: [
              {
                content: [
                  {
                    attrs: {
                      closeTag: '</soft>',
                      kind: 'open',
                      openTag: '<soft>',
                    },
                    type: 'wrapperBoundary',
                  },
                  {
                    text: EMPTY_WRAPPER_TEXT,
                    type: 'text',
                  },
                  {
                    attrs: {
                      closeTag: '</soft>',
                      kind: 'close',
                      openTag: '<soft>',
                    },
                    type: 'wrapperBoundary',
                  },
                ],
                type: 'paragraph',
              },
            ],
            type: 'doc',
          },
          'grok',
        ),
      ).toBe('<soft></soft>');
    });
  });
});
