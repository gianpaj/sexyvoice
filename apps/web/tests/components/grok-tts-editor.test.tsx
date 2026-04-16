// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { GrokTTSEditor } from '@/components/grok-tts-editor';
import messages from '@/messages/en.json';

const UNSUPPORTED_GROK_TAG_HIGHLIGHT_CLASSES = [
  'rounded',
  'bg-red-950',
  'px-0.5',
  'text-red-100',
] as const;
const SUPPORTED_GROK_TAG_CHIP_SELECTOR =
  '[data-grok-instant-tag], [data-grok-wrapper-boundary-node]';

function findEditor() {
  return screen.findByText(
    (_, element) => element?.classList.contains('ProseMirror') ?? false,
  );
}

async function openSuggestionMenu(
  user: ReturnType<typeof userEvent.setup>,
  editor: HTMLElement,
  trigger: '[' | '<',
) {
  await user.click(editor);
  await user.keyboard(trigger === '[' ? '[[' : '<');
}

function getSuggestionDecoration(editor: HTMLElement) {
  return editor.querySelector('[data-decoration-content="Filter..."]');
}

const baseDict = messages.generate.grok;

function renderEditor({
  maxLength = 500,
  onChange = vi.fn(),
  placeholder = messages.generate.textAreaPlaceholder,
  selectedGrokLanguage = 'auto',
  setSelectedGrokLanguage = vi.fn(),
  value = '',
}: {
  maxLength?: number;
  onChange?: (text: string) => void;
  placeholder?: string;
  selectedGrokLanguage?: string;
  setSelectedGrokLanguage?: (text: string) => void;
  value?: string;
} = {}) {
  return render(
    <GrokTTSEditor
      dict={baseDict}
      maxLength={maxLength}
      onChange={onChange}
      placeholder={placeholder}
      selectedGrokLanguage={selectedGrokLanguage}
      setSelectedGrokLanguage={setSelectedGrokLanguage}
      value={value}
    />,
  );
}

function selectEditorText(editor: HTMLElement, text: string) {
  const paragraph = editor.querySelector('p');

  if (!paragraph) {
    throw new Error('Expected editor to contain a paragraph');
  }

  const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
  let textNode: Text | null = null;
  let start = -1;

  while (walker.nextNode()) {
    const currentNode = walker.currentNode;

    if (!(currentNode instanceof Text)) {
      continue;
    }

    const currentStart = currentNode.textContent?.indexOf(text) ?? -1;

    if (currentStart >= 0) {
      textNode = currentNode;
      start = currentStart;
      break;
    }
  }

  if (!(textNode instanceof Text)) {
    throw new Error('Expected editor to contain a text node');
  }

  if (start < 0) {
    throw new Error(`Could not find "${text}" in editor`);
  }

  const selection = window.getSelection();
  const range = document.createRange();
  range.setStart(textNode, start);
  range.setEnd(textNode, start + text.length);

  selection?.removeAllRanges();
  selection?.addRange(range);
  fireEvent.focus(editor);
  fireEvent.mouseUp(editor);
  document.dispatchEvent(new Event('selectionchange'));
}

function placeCaretAtEnd(editor: HTMLElement) {
  const paragraph = editor.querySelector('p');

  if (!paragraph) {
    throw new Error('Expected editor to contain a paragraph');
  }

  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(paragraph);
  range.collapse(false);

  selection?.removeAllRanges();
  selection?.addRange(range);
  fireEvent.focus(editor);
  fireEvent.mouseUp(editor);
  document.dispatchEvent(new Event('selectionchange'));
}

function pasteIntoEditor(editor: HTMLElement, text: string) {
  fireEvent.focus(editor);

  const clipboardData = {
    getData: (type: string) => (type === 'text/plain' ? text : ''),
    types: ['text/plain'],
  };

  fireEvent.paste(editor, {
    clipboardData,
  });
}

describe('GrokTTSEditor', () => {
  it('renders the editable content area and effects trigger', async () => {
    const onChange = vi.fn();

    renderEditor({ onChange });

    expect(await findEditor()).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: baseDict.inlineEffectPlaceholder }),
    ).toBeInTheDocument();
    expect(screen.getByText('0 / 500')).toBeInTheDocument();
  });

  it('renders multiline paragraphs in the ProseMirror editor', async () => {
    const onChange = vi.fn();

    renderEditor({ onChange, value: 'Hello\nworld' });

    const editor = await findEditor();

    expect(editor).toHaveTextContent('Hello');
    expect(editor).toHaveTextContent('world');
  });

  it('renders initial multiline content', async () => {
    const onChange = vi.fn();

    renderEditor({ onChange, value: 'Line one\nLine two' });

    const editor = await findEditor();

    expect(editor).toHaveTextContent('Line one');
    expect(editor).toHaveTextContent('Line two');
    expect(screen.getByText('17 / 500')).toBeInTheDocument();
  });

  it('opens the effects popover and shows available effect actions', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    renderEditor({ onChange });

    await user.click(
      screen.getByRole('button', { name: baseDict.inlineEffectPlaceholder }),
    );

    expect(
      await screen.findByRole('heading', {
        name: baseDict.inlineEffectPlaceholder,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /\[laugh\]/i }),
    ).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('inserts an instant tag via the effects popover', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    renderEditor({ onChange });

    await user.click(
      screen.getByRole('button', { name: baseDict.inlineEffectPlaceholder }),
    );
    await user.click(await screen.findByRole('button', { name: /\[pause\]/i }));

    expect(onChange).toHaveBeenCalledWith('[pause]');
  });

  it('hides the placeholder once typing begins', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    renderEditor({ onChange });

    const editor = await findEditor();

    expect(
      screen.getByRole('textbox', {
        name: messages.generate.textAreaPlaceholder,
      }),
    ).toBeInTheDocument();

    await user.type(editor, 'Hello');

    expect(
      screen.queryByText(messages.generate.textAreaPlaceholder),
    ).not.toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith('Hello');
  });

  it('inserts an instant tag at the current caret position', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    renderEditor({ onChange, value: 'Hello' });

    const editor = await findEditor();

    placeCaretAtEnd(editor);

    await user.click(
      screen.getByRole('button', { name: baseDict.inlineEffectPlaceholder }),
    );
    await user.click(await screen.findByRole('button', { name: /\[pause\]/i }));

    await waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith('Hello[pause]');
    });
  });

  it('replaces the current selection when inserting an instant tag', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    renderEditor({ onChange, value: 'Hello world' });

    const editor = await findEditor();

    selectEditorText(editor, 'world');

    await user.click(
      screen.getByRole('button', { name: baseDict.inlineEffectPlaceholder }),
    );
    await user.click(await screen.findByRole('button', { name: /\[pause\]/i }));

    await waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith('Hello [pause]');
    });
  });

  it('wraps selected text with a wrapping tag', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    renderEditor({ onChange, value: 'Hello' });

    const editor = await screen.findByText(
      (_, element) => element?.classList.contains('ProseMirror') ?? false,
    );

    selectEditorText(editor, 'Hello');

    await user.click(
      screen.getByRole('button', { name: baseDict.inlineEffectPlaceholder }),
    );
    await user.click(await screen.findByRole('button', { name: /<soft>/i }));

    await waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith('<soft>Hello</soft>');
    });
    expect(screen.getByText('<soft>')).toBeInTheDocument();
    expect(screen.getByText('</soft>')).toBeInTheDocument();
    await waitFor(() => {
      expect(
        screen.queryByRole('heading', {
          name: baseDict.wrappingEffectPlaceholder,
        }),
      ).not.toBeInTheDocument();
    });
  });

  it('inserts an empty wrapper pair when no text is selected', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    renderEditor({ onChange });

    await user.click(
      screen.getByRole('button', { name: baseDict.inlineEffectPlaceholder }),
    );
    await user.click(await screen.findByRole('button', { name: /<soft>/i }));

    await waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith('<soft></soft>');
    });
    expect(screen.getByText('<soft>')).toBeInTheDocument();
    expect(screen.getByText('</soft>')).toBeInTheDocument();
    await waitFor(() => {
      expect(
        screen.queryByRole('heading', {
          name: baseDict.wrappingEffectPlaceholder,
        }),
      ).not.toBeInTheDocument();
    });
  });

  it('keeps wrapper boundaries visible when typing multiple characters after inserting an empty wrapper', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    renderEditor({ onChange });

    const editor = await findEditor();

    await user.click(
      screen.getByRole('button', { name: baseDict.inlineEffectPlaceholder }),
    );
    await user.click(await screen.findByRole('button', { name: /<soft>/i }));
    const paragraph = editor.querySelector('p');

    if (!(paragraph instanceof HTMLElement)) {
      throw new Error('Expected editor paragraph to be rendered');
    }

    await user.click(paragraph);
    await user.keyboard('ab');

    await waitFor(() => {
      expect(onChange).toHaveBeenCalled();
    });
    expect(onChange).toHaveBeenCalledWith('<soft></soft>');

    await waitFor(() => {
      const serializedCalls = onChange.mock.calls.map(([value]) => value);
      expect(
        serializedCalls.some(
          (value) =>
            value === '<soft>ab</soft>' ||
            value === '<soft></soft>ab' ||
            value === 'ab<soft></soft>',
        ),
      ).toBe(true);
    });

    expect(screen.getByText('<soft>')).toBeInTheDocument();
    expect(screen.getByText('</soft>')).toBeInTheDocument();
  });

  it('opens the instant tag suggestion menu when typing [', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    renderEditor({ onChange });

    const editor = await findEditor();

    await openSuggestionMenu(user, editor, '[');

    expect(await screen.findByRole('listbox')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'pause' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'laugh' })).toBeInTheDocument();
  });

  it('inserts an instant tag from the [ suggestion menu', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    renderEditor({ onChange });

    const editor = await findEditor();

    await openSuggestionMenu(user, editor, '[');
    await user.click(await screen.findByRole('button', { name: 'pause' }));

    await waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith('[pause]');
    });
  });

  it('opens the wrapping tag suggestion menu when typing <', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    renderEditor({ onChange });

    const editor = await findEditor();

    await openSuggestionMenu(user, editor, '<');

    expect(await screen.findByRole('listbox')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'soft' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'whisper' })).toBeInTheDocument();
  });

  it('wraps selected text from the < suggestion menu', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    renderEditor({ onChange, value: 'Hello' });

    const editor = await findEditor();

    placeCaretAtEnd(editor);
    await openSuggestionMenu(user, editor, '<');
    await user.click(await screen.findByRole('button', { name: 'soft' }));

    await waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith('<soft></soft>Hello');
    });
    expect(screen.getByText('<soft>')).toBeInTheDocument();
    expect(screen.getByText('</soft>')).toBeInTheDocument();
  });

  it('dismisses the [ suggestion menu and Filter decoration on Escape', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    renderEditor({ onChange });

    const editor = await findEditor();

    await openSuggestionMenu(user, editor, '[');

    const listbox = await screen.findByRole('listbox');
    expect(
      within(listbox).getByRole('button', { name: 'pause' }),
    ).toBeInTheDocument();
    expect(getSuggestionDecoration(editor)).toBeInTheDocument();

    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });
    expect(getSuggestionDecoration(editor)).not.toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith('');
  });

  it('keeps page focus in the suggestion menu when navigating with ArrowDown', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    renderEditor({ onChange });

    const editor = await findEditor();
    const scrollToSpy = vi
      .spyOn(window, 'scrollTo')
      .mockImplementation(() => undefined);

    await openSuggestionMenu(user, editor, '[');

    const listbox = await screen.findByRole('listbox');
    expect(
      within(listbox).getByRole('button', { name: 'pause' }),
    ).toBeInTheDocument();

    await user.keyboard('{ArrowDown}');

    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(scrollToSpy).not.toHaveBeenCalled();

    scrollToSpy.mockRestore();
  });

  it('auto-closes the [ suggestion menu when typing ]', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    renderEditor({ onChange });

    const editor = await findEditor();

    await openSuggestionMenu(user, editor, '[');

    expect(await screen.findByRole('listbox')).toBeInTheDocument();
    expect(getSuggestionDecoration(editor)).toBeInTheDocument();

    await user.keyboard('unknown-tag]');

    await waitFor(() => {
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });
    expect(getSuggestionDecoration(editor)).not.toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith('[unknown-tag]');
  });

  it('auto-closes the < suggestion menu when typing >', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    renderEditor({ onChange });

    const editor = await findEditor();

    await openSuggestionMenu(user, editor, '<');

    expect(await screen.findByRole('listbox')).toBeInTheDocument();
    expect(getSuggestionDecoration(editor)).toBeInTheDocument();

    await user.keyboard('mystery>');

    await waitFor(() => {
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });
    expect(getSuggestionDecoration(editor)).not.toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith('<mystery>');
  });

  it('visually highlights unsupported Grok tags in dark red', async () => {
    const onChange = vi.fn();

    renderEditor({
      onChange,
      value: 'Hello [unknown-tag] <mystery>world</mystery>',
    });

    const editor = await findEditor();

    expect(editor).toHaveTextContent(
      'Hello [unknown-tag] <mystery>world</mystery>',
    );

    const highlightedTags = Array.from(editor.querySelectorAll('span')).filter(
      (element) =>
        UNSUPPORTED_GROK_TAG_HIGHLIGHT_CLASSES.every((className) =>
          element.classList.contains(className),
        ),
    );

    expect(highlightedTags).toHaveLength(3);
    expect(
      Array.from(highlightedTags).map((element) => element.textContent),
    ).toEqual(['[unknown-tag]', '<mystery>', '</mystery>']);
  });

  it('keeps the [ suggestion flow active while narrowing to a supported instant tag', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const onChange = vi.fn();

    renderEditor({ onChange });

    const editor = await findEditor();

    await user.click(editor);
    await user.keyboard('Hello ');
    await user.keyboard('{[}breath');

    const listbox = await screen.findByRole('listbox');
    expect(
      within(listbox).getByRole('button', { name: 'breath' }),
    ).toBeInTheDocument();
    expect(getSuggestionDecoration(editor)).toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith('Hello [breath');
  });

  it('auto-converts a completed supported instant tag when typing the closing bracket', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const onChange = vi.fn();

    renderEditor({ onChange });

    const editor = await findEditor();

    await user.click(editor);
    await user.keyboard('Hello ');
    await user.keyboard('{[}breath');
    await user.keyboard('{]}');

    await waitFor(() => {
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });
    expect(getSuggestionDecoration(editor)).not.toBeInTheDocument();
    expect(
      editor.querySelector('[data-grok-instant-tag][tag="[breath]"]'),
    ).toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith('Hello [breath]');
  });

  it('shows the < suggestion menu for a partial wrapper query typed after <', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const onChange = vi.fn();

    renderEditor({ onChange });

    const editor = await findEditor();

    await user.click(editor);
    await user.keyboard('Hello <emphasis');

    const listbox = await screen.findByRole('listbox');
    expect(
      within(listbox).getByRole('button', { name: 'emphasis' }),
    ).toBeInTheDocument();
    expect(getSuggestionDecoration(editor)).toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith('Hello <emphasis');
  });

  it('auto-converts a completed standalone opening wrapper tag when typing >', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const onChange = vi.fn();

    renderEditor({ onChange });

    const editor = await findEditor();

    await user.click(editor);
    await user.keyboard('Hello <emphasis');
    await user.keyboard('>');

    await waitFor(() => {
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });
    expect(getSuggestionDecoration(editor)).not.toBeInTheDocument();
    expect(
      editor.querySelector(
        '[data-grok-wrapper-boundary-node][data-grok-wrapper-boundary-kind="open"][data-grok-wrapper-open-tag="<emphasis>"]',
      ),
    ).toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith('Hello <emphasis>');
  });

  it('does not open the < suggestion flow when typing < before existing partial wrapper text', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const onChange = vi.fn();

    renderEditor({ onChange, value: 'emphasis>' });

    const editor = await findEditor();

    placeCaretAtEnd(editor);
    await user.keyboard(
      '{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}',
    );
    await user.keyboard('<');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(getSuggestionDecoration(editor)).not.toBeInTheDocument();
  });

  it('auto-converts pasted supported Grok tags into chips', async () => {
    const onChange = vi.fn();
    const pastedText =
      '<soft>Oh baby... </soft> [inhale] [sigh] <build-intensity>yes</build-intensity>';

    renderEditor({ onChange });

    const editor = await findEditor();

    pasteIntoEditor(editor, pastedText);

    await waitFor(() => {
      expect(
        editor.querySelectorAll(SUPPORTED_GROK_TAG_CHIP_SELECTOR),
      ).toHaveLength(6);
    });

    expect(
      editor.querySelector(
        '[data-grok-wrapper-boundary-node][data-grok-wrapper-boundary-kind="open"][data-grok-wrapper-open-tag="<soft>"]',
      ),
    ).toBeInTheDocument();
    expect(
      editor.querySelector(
        '[data-grok-wrapper-boundary-node][data-grok-wrapper-boundary-kind="close"][data-grok-wrapper-close-tag="</soft>"]',
      ),
    ).toBeInTheDocument();
    expect(
      editor.querySelector('[data-grok-instant-tag][tag="[inhale]"]'),
    ).toBeInTheDocument();
    expect(
      editor.querySelector('[data-grok-instant-tag][tag="[sigh]"]'),
    ).toBeInTheDocument();
    expect(
      editor.querySelector(
        '[data-grok-wrapper-boundary-node][data-grok-wrapper-boundary-kind="open"][data-grok-wrapper-open-tag="<build-intensity>"]',
      ),
    ).toBeInTheDocument();
    expect(
      editor.querySelector(
        '[data-grok-wrapper-boundary-node][data-grok-wrapper-boundary-kind="close"][data-grok-wrapper-close-tag="</build-intensity>"]',
      ),
    ).toBeInTheDocument();
    expect(editor).toHaveTextContent(
      '<soft>Oh baby... </soft> [inhale] [sigh] <build-intensity>yes</build-intensity>',
    );
  });
});
