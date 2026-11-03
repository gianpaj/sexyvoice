// @vitest-environment jsdom
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { describe, expect, it } from 'vitest';

import { AutoConvertGrokTags } from '@/components/grok-tts/extensions/auto-convert-grok-tags';
import { WrapperBoundary } from '@/components/grok-tts/extensions/grok-wrapper-boundary';
import { InstantTag } from '@/components/grok-tts/extensions/instant-tag';
import { findUnsupportedGrokTagMatches } from '@/components/grok-tts/extensions/unsupported-grok-tag-highlight';
import {
  type TtsEditorProvider,
  ttsTextToTipTapDoc,
  ttsTipTapDocToText,
} from '@/lib/tts-editor';
import { VOXTRAL_EMOTIONS, VOXTRAL_TAGS } from '@/lib/voxtral-tags';

describe('Voxtral tags', () => {
  it('includes all 34 unique documented emotions', () => {
    expect(VOXTRAL_EMOTIONS).toHaveLength(34);
    expect(new Set(VOXTRAL_EMOTIONS).size).toBe(34);
  });

  it.each(VOXTRAL_TAGS)(
    'round-trips %s as a chip with multiline text',
    (tag) => {
      const text = `Before ${tag} after\nNext line`;
      const doc = ttsTextToTipTapDoc(text, 'voxtral');
      expect(doc.content[0].content).toContainEqual({
        attrs: { tag },
        type: 'instantTag',
      });
      expect(ttsTipTapDocToText(doc, 'voxtral')).toBe(text);
    },
  );

  it('keeps unknown and Grok-only tags as literal text for Voxtral', () => {
    const text = '[emotion=ecstatic] [pause] <soft>Hi</soft>';
    expect(ttsTextToTipTapDoc(text, 'voxtral').content[0].content).toEqual([
      { type: 'text', text },
    ]);
    expect(
      findUnsupportedGrokTagMatches(text, 'voxtral').map(({ text }) => text),
    ).toEqual(['[emotion=ecstatic]', '[pause]', '<soft>', '</soft>']);
  });

  it('recognizes assignment tags and vocal sounds in provider-aware highlighting', () => {
    const text = '[emotion=sarcastic][pace=slow][throat clearing]';
    expect(findUnsupportedGrokTagMatches(text, 'voxtral')).toEqual([]);
    expect(findUnsupportedGrokTagMatches(text, 'grok')).toHaveLength(3);
  });

  it.each<TtsEditorProvider>(['grok', 'voxtral'])(
    'copies %s tags with exact syntax and newlines',
    (provider) => {
      const text =
        provider === 'voxtral'
          ? '[emotion=sarcastic] Hi\n[pace=slow][sigh] Again'
          : '<soft>Hi</soft>\n[pause] Again';
      const editor = new Editor({
        content: ttsTextToTipTapDoc(text, provider),
        coreExtensionOptions: {
          clipboardTextSerializer: { blockSeparator: '\n' },
        },
        extensions: [
          StarterKit,
          InstantTag.configure({ provider }),
          WrapperBoundary,
        ],
      });
      try {
        editor.commands.selectAll();
        const slice = editor.state.selection.content();
        const clipboard = editor.view.someProp(
          'clipboardTextSerializer',
          (serialize) => serialize(slice, editor.view),
        );
        expect(clipboard).toBe(text);
      } finally {
        editor.destroy();
      }
    },
  );

  it('keeps text typed after a converted emotion tag after the chip', () => {
    const editor = new Editor({
      content: ttsTextToTipTapDoc('', 'voxtral'),
      extensions: [
        StarterKit,
        InstantTag.configure({ provider: 'voxtral' }),
        AutoConvertGrokTags.configure({ provider: 'voxtral' }),
      ],
    });
    try {
      for (const character of '[emotion=sarcastic] Hello') {
        editor.commands.insertContent(character);
      }
      expect(ttsTipTapDocToText(editor.getJSON(), 'voxtral')).toBe(
        '[emotion=sarcastic] Hello',
      );
    } finally {
      editor.destroy();
    }
  });
});
