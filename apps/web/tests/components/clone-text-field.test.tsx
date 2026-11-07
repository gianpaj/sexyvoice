// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import { CloneTextField } from '@/app/[lang]/(dashboard)/dashboard/clone/clone-text-field';
import { CHARACTERS_LIMIT_GRACE } from '@/lib/ui-constants';
import messages from '@/messages/en.json';

vi.mock('@/lib/i18n/navigation', () => ({
  Link: (props: React.ComponentProps<'a'>) => <a {...props} />,
}));

function renderField({
  text = '',
  textMaxLength = 500,
  usesVoxtral = false,
}: {
  text?: string;
  textMaxLength?: number;
  usesVoxtral?: boolean;
}) {
  const dispatch = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <CloneTextField
        disabled={false}
        dispatch={dispatch}
        selectedLocaleCode="en"
        text={text}
        textMaxLength={textMaxLength}
        userHasPaid={false}
        usesVoxtral={usesVoxtral}
      />
    </NextIntlClientProvider>,
  );
  return { dispatch };
}

describe('CloneTextField', () => {
  it('counts textarea text against the limit with the shared grace', () => {
    const { dispatch } = renderField({ text: 'Hello' });
    const input = screen.getByTestId('clone-text-input');

    expect(input.tagName).toBe('TEXTAREA');
    expect(input).toHaveAttribute(
      'maxlength',
      String(500 + CHARACTERS_LIMIT_GRACE),
    );
    expect(screen.getByTestId('clone-character-count')).toHaveTextContent(
      '5 / 500',
    );
    expect(screen.getByTestId('clone-character-count')).not.toHaveClass(
      'text-red-500',
    );
    expect(
      screen.queryByRole('link', {
        name: messages.clone.upgradeTextLimitTooltip.replace('{MAX}', '4000'),
      }),
    ).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: 'Hello there' } });
    expect(dispatch).toHaveBeenCalledWith({
      patch: { text: 'Hello there' },
      type: 'patch',
    });
  });

  it('marks text over the limit', () => {
    renderField({ text: 'a'.repeat(501) });

    expect(screen.getByTestId('clone-character-count')).toHaveClass(
      'text-red-500',
    );
  });

  it('uses the tag editor and the upgrade crown for Voxtral', async () => {
    renderField({ text: 'Hello', usesVoxtral: true });

    const editor = await screen.findByTestId('clone-text-input');
    expect(editor).toHaveAttribute('contenteditable', 'true');
    expect(screen.getByTestId('clone-character-count')).toHaveTextContent(
      '5 / 500',
    );
    expect(
      screen.getByRole('link', {
        name: messages.clone.upgradeTextLimitTooltip.replace('{MAX}', '4000'),
      }),
    ).toHaveAttribute('href', '/dashboard/credits');
  });
});
