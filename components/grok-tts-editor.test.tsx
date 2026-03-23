// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { GrokTTSEditor } from '@/components/grok-tts-editor';

function selectEditorText(editor: HTMLElement, text: string) {
  const textNode = editor.querySelector('p')?.firstChild;

  if (!(textNode instanceof Text)) {
    throw new Error('Expected editor to contain a text node');
  }

  const start = textNode.textContent?.indexOf(text) ?? -1;
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

describe('GrokTTSEditor', () => {
  it('renders the editable content area and effects trigger', async () => {
    const onChange = vi.fn();

    render(
      <GrokTTSEditor
        maxLength={500}
        onChange={onChange}
        placeholder="Type your script"
        value=""
      />,
    );

    expect(
      await screen.findByText(
        (_, element) => element?.classList.contains('ProseMirror') ?? false,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /effects/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('0 / 500')).toBeInTheDocument();
  });

  it('renders multiline paragraphs in the ProseMirror editor', async () => {
    const onChange = vi.fn();

    render(
      <GrokTTSEditor
        maxLength={500}
        onChange={onChange}
        placeholder="Type your script"
        value={'Hello\nworld'}
      />,
    );

    const editor = await screen.findByText(
      (_, element) => element?.classList.contains('ProseMirror') ?? false,
    );

    expect(editor).toHaveTextContent('Hello');
    expect(editor).toHaveTextContent('world');
  });

  it('renders initial multiline content', async () => {
    const onChange = vi.fn();

    render(
      <GrokTTSEditor
        maxLength={500}
        onChange={onChange}
        placeholder="Type your script"
        value={'Line one\nLine two'}
      />,
    );

    const editor = await screen.findByText(
      (_, element) => element?.classList.contains('ProseMirror') ?? false,
    );

    expect(editor).toHaveTextContent('Line one');
    expect(editor).toHaveTextContent('Line two');
    expect(screen.getByText('17 / 500')).toBeInTheDocument();
  });

  it('opens the effects popover and shows available effect actions', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <GrokTTSEditor
        maxLength={500}
        onChange={onChange}
        placeholder="Type your script"
        value=""
      />,
    );

    await user.click(screen.getByRole('button', { name: /effects/i }));

    expect(
      await screen.findByRole('heading', { name: /instant tags/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /\[laugh\]/i }),
    ).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('inserts an instant tag via the effects popover', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <GrokTTSEditor
        maxLength={500}
        onChange={onChange}
        placeholder="Type your script"
        value=""
      />,
    );

    await user.click(screen.getByRole('button', { name: /effects/i }));
    await user.click(await screen.findByRole('button', { name: /\[pause\]/i }));

    expect(onChange).toHaveBeenCalledWith('[pause]');
  });

  it('hides the placeholder once typing begins', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <GrokTTSEditor
        maxLength={500}
        onChange={onChange}
        placeholder="Type your script"
        value=""
      />,
    );

    const editor = await screen.findByText(
      (_, element) => element?.classList.contains('ProseMirror') ?? false,
    );

    expect(screen.getByText('Type your script')).toBeInTheDocument();

    await user.type(editor, 'Hello');

    expect(screen.queryByText('Type your script')).not.toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith('Hello');
  });

  it('wraps selected text with a wrapper tag', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <GrokTTSEditor
        maxLength={500}
        onChange={onChange}
        placeholder="Type your script"
        value="Hello"
      />,
    );

    const editor = await screen.findByText(
      (_, element) => element?.classList.contains('ProseMirror') ?? false,
    );

    selectEditorText(editor, 'Hello');

    await user.click(screen.getByRole('button', { name: /effects/i }));
    await user.click(await screen.findByRole('button', { name: /<soft>/i }));

    await waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith('<soft>Hello</soft>');
    });
    expect(screen.getByText('<soft>')).toBeInTheDocument();
    expect(screen.getByText('</soft>')).toBeInTheDocument();
    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: /wrapper tags/i }),
      ).not.toBeInTheDocument();
    });
  });

  it('inserts an empty wrapper pair when no text is selected', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <GrokTTSEditor
        maxLength={500}
        onChange={onChange}
        placeholder="Type your script"
        value=""
      />,
    );

    await user.click(screen.getByRole('button', { name: /effects/i }));
    await user.click(await screen.findByRole('button', { name: /<soft>/i }));

    await waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith('<soft></soft>');
    });
    expect(screen.getByText('<soft>')).toBeInTheDocument();
    expect(screen.getByText('</soft>')).toBeInTheDocument();
    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: /wrapper tags/i }),
      ).not.toBeInTheDocument();
    });
  });

  it('keeps the closing wrapper tag when typing multiple characters into an empty wrapper', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <GrokTTSEditor
        maxLength={500}
        onChange={onChange}
        placeholder="Type your script"
        value=""
      />,
    );

    const editor = await screen.findByText(
      (_, element) => element?.classList.contains('ProseMirror') ?? false,
    );

    await user.click(screen.getByRole('button', { name: /effects/i }));
    await user.click(await screen.findByRole('button', { name: /<soft>/i }));
    const emptyWrapper = editor.querySelector('[data-grok-wrapper]');

    if (!(emptyWrapper instanceof HTMLElement)) {
      throw new Error('Expected empty wrapper placeholder to be rendered');
    }

    await user.click(emptyWrapper);
    await user.keyboard('ab');

    await waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith('<soft>ab</soft>');
    });
    expect(screen.getByText('<soft>')).toBeInTheDocument();
    expect(screen.getByText('</soft>')).toBeInTheDocument();
  });
});
