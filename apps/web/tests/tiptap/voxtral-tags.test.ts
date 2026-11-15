// @vitest-environment jsdom
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { describe, expect, it } from 'vitest';

import { AutoConvertTags } from '@/components/speech-tags/auto-convert-tags';
import {
  instantTags,
  TAG_CATALOGS,
  type TagProvider,
} from '@/components/speech-tags/catalog';
import { InstantTag } from '@/components/speech-tags/instant-tag';
import {
  docToTaggedText,
  taggedTextToDoc,
} from '@/components/speech-tags/text';
import { findUnknownTagMatches } from '@/components/speech-tags/unknown-tag-highlight';
import { WrapperBoundary } from '@/components/speech-tags/wrapper-boundary';

describe('Voxtral tags', () => {
  it('lists the 34 documented emotions, 5 paces and 14 vocal sounds', () => {
    const [emotions, paces, sounds] = TAG_CATALOGS.voxtral.groups.map(
      ({ tags }) => tags,
    );
    expect(new Set(emotions).size).toBe(34);
    expect(paces).toHaveLength(5);
    expect(sounds).toHaveLength(14);
    expect(TAG_CATALOGS.voxtral.wrappers).toEqual([]);
  });

  it.each(instantTags('voxtral'))(
    'round-trips %s as a chip with multiline text',
    (tag) => {
      const text = `Before ${tag} after\nNext line`;
      const doc = taggedTextToDoc(text, 'voxtral');
      expect(doc.content[0].content).toContainEqual({
        attrs: { tag },
        type: 'instantTag',
      });
      expect(docToTaggedText(doc, 'voxtral')).toBe(text);
    },
  );

  it('keeps unknown and Grok-only tags as literal text for Voxtral', () => {
    const text = '[emotion=ecstatic] [pause] <soft>Hi</soft>';
    expect(taggedTextToDoc(text, 'voxtral').content[0].content).toEqual([
      { type: 'text', text },
    ]);
    expect(
      findUnknownTagMatches(text, 'voxtral').map(({ text }) => text),
    ).toEqual(['[emotion=ecstatic]', '[pause]', '<soft>', '</soft>']);
  });

  it('recognizes assignment tags and vocal sounds in provider-aware highlighting', () => {
    const text = '[emotion=sarcastic][pace=slow][throat clearing]';
    expect(findUnknownTagMatches(text, 'voxtral')).toEqual([]);
    expect(findUnknownTagMatches(text, 'grok')).toHaveLength(3);
  });

  it.each<TagProvider>(['grok', 'voxtral'])(
    'copies %s tags with exact syntax and newlines',
    (provider) => {
      const text =
        provider === 'voxtral'
          ? '[emotion=sarcastic] Hi\n[pace=slow][sigh] Again'
          : '<soft>Hi</soft>\n[pause] Again';
      const editor = new Editor({
        content: taggedTextToDoc(text, provider),
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
      content: taggedTextToDoc('', 'voxtral'),
      extensions: [
        StarterKit,
        InstantTag.configure({ provider: 'voxtral' }),
        AutoConvertTags.configure({ provider: 'voxtral' }),
      ],
    });
    try {
      for (const character of '[emotion=sarcastic] Hello') {
        editor.commands.insertContent(character);
      }
      expect(docToTaggedText(editor.getJSON(), 'voxtral')).toBe(
        '[emotion=sarcastic] Hello',
      );
    } finally {
      editor.destroy();
    }
  });
});
