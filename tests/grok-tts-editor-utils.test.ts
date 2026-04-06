import { describe, expect, it } from 'vitest';

import {
  normalizePartialInstantTags,
  normalizePartialWrapperOpeningTags,
} from '@/components/grok-tts/extensions/auto-convert-grok-tags';
import { findUnsupportedGrokTagMatches } from '@/components/grok-tts/extensions/unsupported-grok-tag-highlight';
import {
  GROK_EMPTY_WRAPPING_TEXT,
  type GrokInstantTag,
  type GrokEditorToken as GrokTtsToken,
  type GrokWrapperCloseTag,
  type GrokWrapperOpenTag,
  grokTextToTipTapDoc,
  grokTipTapDocToText,
  parseGrokTtsText,
  serializeGrokEditorTokens as serializeGrokTtsDoc,
} from '@/lib/tts-editor';

function text(value: string): GrokTtsToken {
  return {
    type: 'text',
    value,
  };
}

function instant(tag: GrokInstantTag): GrokTtsToken {
  return {
    type: 'instant-tag',
    tag,
  };
}

function wrapper(
  openTag: GrokWrapperOpenTag,
  closeTag: GrokWrapperCloseTag,
  children: GrokTtsToken[],
): GrokTtsToken {
  return {
    type: 'wrapper-tag',
    openTag,
    closeTag,
    children,
  };
}

describe('grok-tts-editor-utils', () => {
  describe('findUnsupportedGrokTagMatches', () => {
    it('finds unsupported instant tags', () => {
      expect(
        findUnsupportedGrokTagMatches('Hello [unknown-tag] world'),
      ).toEqual([
        {
          end: 19,
          start: 6,
          text: '[unknown-tag]',
        },
      ]);
    });

    it('finds unsupported wrapping tags', () => {
      expect(findUnsupportedGrokTagMatches('<mystery>Hello</mystery>')).toEqual(
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
        findUnsupportedGrokTagMatches('[pause] <soft>Hello</soft>'),
      ).toEqual([]);
    });

    it('preserves malformed but tag-like text as unsupported matches only when complete', () => {
      expect(findUnsupportedGrokTagMatches('[oops <oops')).toEqual([]);
    });
  });

  describe('parseGrokTtsText', () => {
    it('returns a single text token for plain text', () => {
      expect(parseGrokTtsText('Hello world').tokens).toEqual([
        text('Hello world'),
      ]);
    });

    it('parses instant tags as structured tokens', () => {
      expect(parseGrokTtsText('Hello [laugh] world').tokens).toEqual([
        text('Hello '),
        instant('[laugh]'),
        text(' world'),
      ]);
    });

    it('parses wrapping tags with nested text', () => {
      expect(parseGrokTtsText('<soft>Hello</soft>').tokens).toEqual([
        wrapper('<soft>', '</soft>', [text('Hello')]),
      ]);
    });

    it('parses mixed text, instant tags, and wrapping tags', () => {
      expect(parseGrokTtsText('Hi [pause] <soft>there</soft>').tokens).toEqual([
        text('Hi '),
        instant('[pause]'),
        text(' '),
        wrapper('<soft>', '</soft>', [text('there')]),
      ]);
    });

    it('parses multiline content and preserves newline text nodes', () => {
      expect(parseGrokTtsText('Line one\n[laugh]\nLine two').tokens).toEqual([
        text('Line one\n'),
        instant('[laugh]'),
        text('\nLine two'),
      ]);
    });

    it('supports nested wrapping tags', () => {
      expect(
        parseGrokTtsText('<soft>Hello <fast>there</fast></soft>').tokens,
      ).toEqual([
        wrapper('<soft>', '</soft>', [
          text('Hello '),
          wrapper('<fast>', '</fast>', [text('there')]),
        ]),
      ]);
    });

    it('leaves unknown instant tags as plain text', () => {
      expect(parseGrokTtsText('Hello [unknown-tag] world').tokens).toEqual([
        text('Hello [unknown-tag] world'),
      ]);
    });

    it('leaves unknown wrapping tags as plain text', () => {
      expect(parseGrokTtsText('<mystery>Hello</mystery>').tokens).toEqual([
        text('<mystery>Hello</mystery>'),
      ]);
    });

    it('parses standalone opening wrapper tags as structured tokens', () => {
      expect(parseGrokTtsText('<soft>').tokens).toEqual([
        {
          closeTag: '</soft>',
          openTag: '<soft>',
          type: 'wrapper-open-tag',
        },
      ]);
      expect(parseGrokTtsText('<soft>Hello').tokens).toEqual([
        {
          closeTag: '</soft>',
          openTag: '<soft>',
          type: 'wrapper-open-tag',
        },
        text('Hello'),
      ]);
      expect(parseGrokTtsText('Hello</soft>').tokens).toEqual([
        text('Hello</soft>'),
      ]);
    });

    it('keeps mismatched closing wrapper tags as plain text after a standalone opening wrapper tag', () => {
      expect(parseGrokTtsText('<soft>Hello</fast>').tokens).toEqual([
        {
          closeTag: '</soft>',
          openTag: '<soft>',
          type: 'wrapper-open-tag',
        },
        text('Hello</fast>'),
      ]);
    });
  });

  describe('serializeGrokTtsDoc', () => {
    it('serializes plain text tokens back to text', () => {
      expect(serializeGrokTtsDoc([text('Hello world')])).toBe('Hello world');
    });

    it('serializes instant tags back to bracket syntax', () => {
      expect(
        serializeGrokTtsDoc([
          text('Hello '),
          instant('[laugh]'),
          text(' world'),
        ]),
      ).toBe('Hello [laugh] world');
    });

    it('serializes wrapping tags back to paired syntax', () => {
      expect(
        serializeGrokTtsDoc([wrapper('<soft>', '</soft>', [text('Hello')])]),
      ).toBe('<soft>Hello</soft>');
    });

    it('serializes standalone opening wrapper tags back to opening syntax', () => {
      expect(
        serializeGrokTtsDoc([
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
        serializeGrokTtsDoc([
          wrapper('<soft>', '</soft>', [
            text('Hello '),
            wrapper('<fast>', '</fast>', [text('there')]),
          ]),
        ]),
      ).toBe('<soft>Hello <fast>there</fast></soft>');
    });

    it('serializes multiline token trees with preserved newlines', () => {
      expect(
        serializeGrokTtsDoc([
          text('Line one\n'),
          instant('[laugh]'),
          text('\nLine two'),
        ]),
      ).toBe('Line one\n[laugh]\nLine two');
    });
  });

  describe('normalizePartialInstantTags', () => {
    it('normalizes a partial supported instant tag when [ is typed before it', () => {
      expect(normalizePartialInstantTags('Hello [breath]')).toBe(
        'Hello [breath]',
      );
      expect(normalizePartialInstantTags('Hello [pause]')).toBe(
        'Hello [pause]',
      );
    });

    it('normalizes supported instant tags from partial text', () => {
      expect(normalizePartialInstantTags('Hello [breath] world')).toBe(
        'Hello [breath] world',
      );
      expect(
        normalizePartialInstantTags('Use [long-pause] and [tongue-click]'),
      ).toBe('Use [long-pause] and [tongue-click]');
    });

    it('leaves unsupported or unrelated text unchanged', () => {
      expect(normalizePartialInstantTags('Hello [mystery] world')).toBe(
        'Hello [mystery] world',
      );
      expect(normalizePartialInstantTags('Hello breath] world')).toBe(
        'Hello breath] world',
      );
    });
  });

  describe('normalizePartialWrapperOpeningTags', () => {
    it('normalizes a partial supported wrapper opening tag when < is typed before it', () => {
      expect(normalizePartialWrapperOpeningTags('Hello <emphasis>')).toBe(
        'Hello <emphasis>',
      );
      expect(normalizePartialWrapperOpeningTags('Hello <soft>')).toBe(
        'Hello <soft>',
      );
    });

    it('normalizes supported wrapper opening tags from partial text', () => {
      expect(normalizePartialWrapperOpeningTags('Hello <emphasis> world')).toBe(
        'Hello <emphasis> world',
      );
      expect(
        normalizePartialWrapperOpeningTags(
          'Use <build-intensity> and <higher-pitch>',
        ),
      ).toBe('Use <build-intensity> and <higher-pitch>');
    });

    it('leaves unsupported or unrelated text unchanged', () => {
      expect(normalizePartialWrapperOpeningTags('Hello <mystery> world')).toBe(
        'Hello <mystery> world',
      );
      expect(normalizePartialWrapperOpeningTags('Hello emphasis> world')).toBe(
        'Hello emphasis> world',
      );
    });
  });

  describe('round-trip invariants', () => {
    it('round-trips valid mixed Grok tag content', () => {
      const input =
        'Hello [laugh]\n<soft>Take it <fast>slowly</fast></soft>\n[breath]';
      const parsed = parseGrokTtsText(input).tokens;

      expect(serializeGrokTtsDoc(parsed)).toBe(input);
    });

    it('round-trips valid nested wrapper content', () => {
      const input =
        '<soft>Hello <fast>there</fast> and <whisper>stay close</whisper></soft>';
      const parsed = parseGrokTtsText(input).tokens;

      expect(serializeGrokTtsDoc(parsed)).toBe(input);
    });

    it('round-trips the singing wrapping tag', () => {
      const input = '<singing>La la la</singing>';
      const parsed = parseGrokTtsText(input).tokens;

      expect(parsed).toEqual([
        wrapper('<singing>', '</singing>', [text('La la la')]),
      ]);
      expect(serializeGrokTtsDoc(parsed)).toBe(input);
    });

    it('preserves malformed content by keeping it as text', () => {
      const input = '<soft>Hello</fast> [unknown-tag]';
      const parsed = parseGrokTtsText(input).tokens;

      expect(serializeGrokTtsDoc(parsed)).toBe(input);
    });

    it('round-trips unsupported tags as plain text', () => {
      const input = 'Hello [unknown-tag] <mystery>x</mystery>';

      expect(grokTipTapDocToText(grokTextToTipTapDoc(input))).toBe(input);
    });
  });

  describe('TipTap document conversion', () => {
    it('converts wrapping tags into wrapper boundary nodes', () => {
      expect(grokTextToTipTapDoc('<soft>Hello</soft>')).toEqual({
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
      expect(grokTextToTipTapDoc('<soft>')).toEqual({
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
      expect(grokTextToTipTapDoc('<soft></soft>')).toEqual({
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
                text: GROK_EMPTY_WRAPPING_TEXT,
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
      expect(grokTextToTipTapDoc('Hello [pause]')).toEqual({
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
        grokTipTapDocToText({
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
        }),
      ).toBe('<soft>Hello [laugh]</soft>there');
    });

    it('serializes a standalone opening wrapper boundary back to opening tag text', () => {
      expect(
        grokTipTapDocToText({
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
        }),
      ).toBe('<soft>');
    });

    it('serializes empty wrapper placeholder text back to empty tags', () => {
      expect(
        grokTipTapDocToText({
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
                  text: GROK_EMPTY_WRAPPING_TEXT,
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
        }),
      ).toBe('<soft></soft>');
    });
  });
});
