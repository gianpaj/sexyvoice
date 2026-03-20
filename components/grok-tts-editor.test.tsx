// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { GrokTTSEditor } from '@/components/grok-tts-editor';

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
});
