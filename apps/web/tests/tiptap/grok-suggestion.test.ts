// @vitest-environment jsdom
import { Editor, Extension } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';
import { exitSuggestion, Suggestion } from '@tiptap/suggestion';
import { describe, expect, it, vi } from 'vitest';

import { isGrokWrapperSuggestionAllowed } from '@/components/grok-tts/suggestion-rules';
import { GROK_INSTANT_TAGS, GROK_WRAPPING_TAGS } from '@/lib/tts-editor';

const WRAPPING_TAGS = GROK_WRAPPING_TAGS.map(([openTag]) => openTag);
const INSTANT_TAGS = GROK_INSTANT_TAGS;

const GROK_INSTANT_TAG_MENU_PLUGIN_KEY = new PluginKey('grokInstantTagMenu');
const GROK_WRAPPER_TAG_MENU_PLUGIN_KEY = new PluginKey('grokWrapperTagMenu');

function createItems(tags: readonly string[]) {
  return tags.map((tag) => ({
    title: tag,
    onSelect: vi.fn(),
  }));
}

function shouldCloseSuggestionForQuery(
  char: string | undefined,
  query: string,
): boolean {
  if (!query) {
    return false;
  }

  if (char === '[') {
    return query.includes(']');
  }

  if (char === '<') {
    return query.includes('>');
  }

  return false;
}

function createGrokSuggestionExtension(options: {
  char: '[' | '<';
  items: ReturnType<typeof createItems>;
  pluginKey: PluginKey;
  shouldAllow?: (props: {
    editor: Editor;
    range: { from: number; to: number };
    state: Editor['state'];
  }) => boolean;
  onStart?: ReturnType<typeof vi.fn<(props: unknown) => void>>;
  onUpdate?: ReturnType<typeof vi.fn<(props: { query: string }) => void>>;
  onExit?: ReturnType<typeof vi.fn<(props: unknown) => void>>;
}) {
  const {
    char,
    items,
    pluginKey,
    shouldAllow,
    onStart = vi.fn<(props: unknown) => void>(),
    onUpdate = vi.fn<(props: { query: string }) => void>(),
    onExit = vi.fn<(props: unknown) => void>(),
  } = options;

  const extension = Extension.create({
    name: `grok-suggestion-${char === '[' ? 'instant' : 'wrapper'}`,
    addProseMirrorPlugins() {
      return [
        Suggestion({
          editor: this.editor,
          char,
          pluginKey,
          items: ({ query }) =>
            items.filter((item) =>
              item.title.toLowerCase().includes(query.toLowerCase()),
            ),
          allow: shouldAllow
            ? ({ editor, range, state }) =>
                shouldAllow({ editor, range, state })
            : undefined,
          render: () => ({
            onStart: (props) => {
              onStart(props);
            },
            onUpdate: (props) => {
              onUpdate(props);

              if (shouldCloseSuggestionForQuery(char, props.query)) {
                exitSuggestion(this.editor.view, pluginKey);
              }
            },
            onExit: (props) => {
              onExit(props);
            },
          }),
        }),
      ];
    },
  });

  return {
    extension,
    onExit,
    onStart,
    onUpdate,
  };
}

function createEditor(extensions: Extension[], content = '<p></p>') {
  return new Editor({
    extensions: [StarterKit, ...extensions],
    content,
  });
}

describe('grok suggestion lifecycle', () => {
  it('opens the instant-tag suggestion when typing [', async () => {
    const suggestion = createGrokSuggestionExtension({
      char: '[',
      items: createItems(INSTANT_TAGS),
      pluginKey: GROK_INSTANT_TAG_MENU_PLUGIN_KEY,
    });

    const editor = createEditor([suggestion.extension]);

    editor.chain().insertContent('[').run();
    await Promise.resolve();

    expect(suggestion.onStart).toHaveBeenCalledTimes(1);
    expect(suggestion.onUpdate).not.toHaveBeenCalled();

    editor.destroy();
  });

  it('opens the wrapper suggestion when typing <', async () => {
    const suggestion = createGrokSuggestionExtension({
      char: '<',
      items: createItems(WRAPPING_TAGS),
      pluginKey: GROK_WRAPPER_TAG_MENU_PLUGIN_KEY,
    });

    const editor = createEditor([suggestion.extension]);

    editor.chain().insertContent('<').run();
    await Promise.resolve();

    expect(suggestion.onStart).toHaveBeenCalledTimes(1);
    expect(suggestion.onUpdate).not.toHaveBeenCalled();

    editor.destroy();
  });

  it('closes the instant-tag suggestion when typing ]', async () => {
    const suggestion = createGrokSuggestionExtension({
      char: '[',
      items: createItems(INSTANT_TAGS),
      pluginKey: GROK_INSTANT_TAG_MENU_PLUGIN_KEY,
    });

    const editor = createEditor([suggestion.extension]);

    editor.chain().insertContent('[breath').run();
    await Promise.resolve();

    expect(suggestion.onStart).toHaveBeenCalledTimes(1);

    editor.chain().insertContent(']').run();
    await Promise.resolve();

    expect(suggestion.onUpdate).toHaveBeenCalled();
    expect(suggestion.onExit).toHaveBeenCalled();

    editor.destroy();
  });

  it('closes the wrapper suggestion when typing >', async () => {
    const suggestion = createGrokSuggestionExtension({
      char: '<',
      items: createItems(WRAPPING_TAGS),
      pluginKey: GROK_WRAPPER_TAG_MENU_PLUGIN_KEY,
    });

    const editor = createEditor([suggestion.extension]);

    editor.chain().insertContent('<emphasis').run();
    await Promise.resolve();

    expect(suggestion.onStart).toHaveBeenCalledTimes(1);

    editor.chain().insertContent('>').run();
    await Promise.resolve();

    expect(suggestion.onUpdate).toHaveBeenCalled();
    expect(suggestion.onExit).toHaveBeenCalled();

    editor.destroy();
  });

  it('does not open the wrapper suggestion when allow blocks typing < before existing partial wrapper text', async () => {
    const suggestion = createGrokSuggestionExtension({
      char: '<',
      items: createItems(WRAPPING_TAGS),
      pluginKey: GROK_WRAPPER_TAG_MENU_PLUGIN_KEY,
      shouldAllow: isGrokWrapperSuggestionAllowed,
    });

    const editor = createEditor([suggestion.extension], '<p>emphasis&gt;</p>');

    editor.commands.setTextSelection(1);
    editor.chain().insertContent('<').run();
    await Promise.resolve();

    expect(suggestion.onStart).not.toHaveBeenCalled();
    expect(editor.getText()).toBe('<emphasis>');

    editor.destroy();
  });

  it('still opens the wrapper suggestion when typing a fresh partial wrapper tag from scratch', async () => {
    const suggestion = createGrokSuggestionExtension({
      char: '<',
      items: createItems(WRAPPING_TAGS),
      pluginKey: GROK_WRAPPER_TAG_MENU_PLUGIN_KEY,
      shouldAllow: isGrokWrapperSuggestionAllowed,
    });

    const editor = createEditor([suggestion.extension]);

    editor.chain().insertContent('<emphasis').run();
    await Promise.resolve();

    expect(suggestion.onStart).toHaveBeenCalledTimes(1);
    expect(suggestion.onExit).not.toHaveBeenCalled();

    editor.destroy();
  });

  it('blocks stale wrapper suggestion ranges without resolving out-of-bounds positions', () => {
    const editor = createEditor([]);
    const staleRange = {
      from: editor.state.doc.content.size + 1,
      to: editor.state.doc.content.size + 10,
    };

    expect(() =>
      isGrokWrapperSuggestionAllowed({
        editor,
        range: staleRange,
        state: editor.state,
      }),
    ).not.toThrow();
    expect(
      isGrokWrapperSuggestionAllowed({
        editor,
        range: staleRange,
        state: editor.state,
      }),
    ).toBe(false);

    editor.destroy();
  });

  it('does not immediately reopen the instant-tag suggestion after dismissal in the same context', async () => {
    const suggestion = createGrokSuggestionExtension({
      char: '[',
      items: createItems(INSTANT_TAGS),
      pluginKey: GROK_INSTANT_TAG_MENU_PLUGIN_KEY,
    });

    const editor = createEditor([suggestion.extension]);

    editor.chain().insertContent('[breath').run();
    await Promise.resolve();

    expect(suggestion.onStart).toHaveBeenCalledTimes(1);

    exitSuggestion(editor.view, GROK_INSTANT_TAG_MENU_PLUGIN_KEY);
    await Promise.resolve();

    const startCallsBefore = suggestion.onStart.mock.calls.length;
    const updateCallsBefore = suggestion.onUpdate.mock.calls.length;

    editor.chain().insertContent('x').run();
    await Promise.resolve();

    expect(suggestion.onStart.mock.calls.length).toBe(startCallsBefore);
    expect(suggestion.onUpdate.mock.calls.length).toBe(updateCallsBefore);

    editor.destroy();
  });

  it('does not immediately reopen the wrapper suggestion after dismissal in the same context', async () => {
    const suggestion = createGrokSuggestionExtension({
      char: '<',
      items: createItems(WRAPPING_TAGS),
      pluginKey: GROK_WRAPPER_TAG_MENU_PLUGIN_KEY,
    });

    const editor = createEditor([suggestion.extension]);

    editor.chain().insertContent('<emphasis').run();
    await Promise.resolve();

    expect(suggestion.onStart).toHaveBeenCalledTimes(1);

    exitSuggestion(editor.view, GROK_WRAPPER_TAG_MENU_PLUGIN_KEY);
    await Promise.resolve();

    const startCallsBefore = suggestion.onStart.mock.calls.length;
    const updateCallsBefore = suggestion.onUpdate.mock.calls.length;

    editor.chain().insertContent('x').run();
    await Promise.resolve();

    expect(suggestion.onStart.mock.calls.length).toBe(startCallsBefore);
    expect(suggestion.onUpdate.mock.calls.length).toBe(updateCallsBefore);

    editor.destroy();
  });
});
