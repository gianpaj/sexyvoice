// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { type ComponentProps, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { SpeechTextField } from '@/components/speech-text-field';
import { CHARACTERS_LIMIT_GRACE } from '@/lib/ui-constants';
import messages from '@/messages/en.json';

vi.mock('@/lib/i18n/navigation', () => ({
  Link: (props: React.ComponentProps<'a'>) => <a {...props} />,
}));

vi.mock('@/lib/react-textarea-autosize', () => ({
  resizeTextarea: vi.fn(),
}));

const TEST_IDS = { count: 'count', input: 'input' };

function Field({
  initialValue = '',
  ...props
}: Partial<ComponentProps<typeof SpeechTextField>> & {
  initialValue?: string;
}) {
  const [value, setValue] = useState(initialValue);
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      <SpeechTextField
        isPaidUser={false}
        limit={10}
        limitTooltip="Upgrade for more"
        onChange={setValue}
        placeholder="Speak"
        testIds={TEST_IDS}
        value={value}
        {...props}
      />
    </NextIntlClientProvider>
  );
}

describe('SpeechTextField', () => {
  it('counts textarea text against the limit and lets typing run a grace over it', () => {
    render(<Field />);
    const input = screen.getByTestId('input');

    expect(input.tagName).toBe('TEXTAREA');
    expect(input).toHaveAttribute(
      'maxlength',
      String(10 + CHARACTERS_LIMIT_GRACE),
    );
    fireEvent.change(input, { target: { value: 'Hello' } });
    expect(screen.getByTestId('count')).toHaveTextContent('5 / 10');
    expect(screen.getByTestId('count')).not.toHaveClass('text-red-500');

    fireEvent.change(input, { target: { value: 'Hello there' } });
    expect(screen.getByTestId('count')).toHaveTextContent('11 / 10');
    expect(screen.getByTestId('count')).toHaveClass('text-red-500');
    expect(
      screen.getByRole('link', { name: 'Upgrade for more' }),
    ).toBeInTheDocument();
  });

  it('shows only the length when the limit is lifted', () => {
    render(<Field enforceLimit={false} initialValue="Hello there" />);

    expect(screen.getByTestId('input')).not.toHaveAttribute('maxlength');
    expect(screen.getByTestId('count')).toHaveTextContent(/^11$/);
    expect(screen.getByTestId('count')).not.toHaveClass('text-red-500');
  });

  it('shows a count label in place of the count and crown', () => {
    render(<Field countLabel="11 chars -> 2 segments" initialValue="x" />);

    expect(screen.getByTestId('count')).toHaveTextContent(
      '11 chars -> 2 segments',
    );
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('leaves the crown out without a tooltip', () => {
    render(<Field limitTooltip={undefined} />);

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('offers Improve text and fullscreen on an expandable field', async () => {
    const user = userEvent.setup();
    const onEnhance = vi.fn();
    render(
      <Field
        enhance={{ disabled: false, isEnhancing: false, onEnhance }}
        expandable
        initialValue="Hello"
      />,
    );
    const input = screen.getByTestId('input');

    expect(input).toHaveClass('pr-20');
    await user.click(screen.getByTitle(messages.generate.enhanceTextTitle));
    expect(onEnhance).toHaveBeenCalledOnce();

    expect(input.style.getPropertyValue('--textarea-height')).toBe('8rem');
    await user.click(screen.getByTitle(messages.generate.fullscreenTitle));
    expect(input.style.getPropertyValue('--textarea-height')).toBe('30vh');
  });

  it('keeps Improve text off while the text is empty', () => {
    render(
      <Field
        enhance={{ disabled: false, isEnhancing: false, onEnhance: vi.fn() }}
        expandable
      />,
    );

    expect(
      screen.getByTitle(messages.generate.enhanceTextTitle),
    ).toBeDisabled();
  });

  it('is a fixed five-row textarea when not expandable', () => {
    render(<Field />);

    expect(screen.getByTestId('input')).toHaveAttribute('rows', '5');
    expect(
      screen.queryByTitle(messages.generate.fullscreenTitle),
    ).not.toBeInTheDocument();
  });

  it('uses the tag editor with the count in its toolbar for tag providers', async () => {
    render(<Field initialValue="Hello [pause]" provider="grok" />);

    const editor = await screen.findByTestId('input');
    expect(editor).toHaveAttribute('contenteditable', 'true');
    expect(screen.getByTestId('count')).toHaveTextContent('13 / 10');
    expect(screen.getByTestId('count')).toHaveClass('text-red-500');
    expect(
      screen.getByRole('button', {
        name: messages.generate.grok.inlineEffectPlaceholder,
      }).parentElement,
    ).toContainElement(screen.getByTestId('count'));
  });
});
