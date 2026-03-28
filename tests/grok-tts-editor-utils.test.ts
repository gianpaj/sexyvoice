import { describe, expect, it } from 'vitest';

import {
  GROK_EMPTY_WRAPPER_TEXT,
  type GrokInstantTag,
  type GrokEditorToken as GrokTtsToken,
  type GrokWrapperCloseTag,
  type GrokWrapperOpenTag,
  grokTextToTipTapDoc,
  grokTipTapDocToText,
  parseGrokTtsText,
  serializeGrokEditorTokens as serializeGrokTtsDoc,
} from '@/lib/grok-tts-editor';

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

    it('parses wrapper tags with nested text', () => {
      expect(parseGrokTtsText('<soft>Hello</soft>').tokens).toEqual([
        wrapper('<soft>', '</soft>', [text('Hello')]),
      ]);
    });

    it('parses mixed text, instant tags, and wrapper tags', () => {
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

    it('supports nested wrapper tags', () => {
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

    it('leaves unknown wrapper tags as plain text', () => {
      expect(parseGrokTtsText('<mystery>Hello</mystery>').tokens).toEqual([
        text('<mystery>Hello</mystery>'),
      ]);
    });

    it('leaves malformed wrapper syntax as plain text', () => {
      expect(parseGrokTtsText('<soft>Hello').tokens).toEqual([
        text('<soft>Hello'),
      ]);
      expect(parseGrokTtsText('Hello</soft>').tokens).toEqual([
        text('Hello</soft>'),
      ]);
    });

    it('leaves mismatched wrapper tags as plain text', () => {
      expect(parseGrokTtsText('<soft>Hello</fast>').tokens).toEqual([
        text('<soft>Hello</fast>'),
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

    it('serializes wrapper tags back to paired syntax', () => {
      expect(
        serializeGrokTtsDoc([wrapper('<soft>', '</soft>', [text('Hello')])]),
      ).toBe('<soft>Hello</soft>');
    });

    it('serializes nested wrapper tags correctly', () => {
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

    it('preserves malformed content by keeping it as text', () => {
      const input = '<soft>Hello</fast> [unknown-tag]';
      const parsed = parseGrokTtsText(input).tokens;

      expect(serializeGrokTtsDoc(parsed)).toBe(input);
    });
  });

  describe('TipTap document conversion', () => {
    it('converts wrapper tags into wrapper boundary nodes', () => {
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

    it('keeps empty wrapper tags as boundary nodes with placeholder text', () => {
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
                text: GROK_EMPTY_WRAPPER_TEXT,
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
                  text: GROK_EMPTY_WRAPPER_TEXT,
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
