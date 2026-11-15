// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import { GrokLanguageSelect } from '@/components/grok-language-select';
import { GROK_LANGUAGES } from '@/lib/tts/models';
import messages from '@/messages/en.json';

describe('GrokLanguageSelect', () => {
  it('offers every Grok language, Automatic first and English second', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <GrokLanguageSelect onChange={onChange} value="auto" />
      </NextIntlClientProvider>,
    );

    const trigger = screen.getByRole('combobox');
    expect(trigger).toHaveTextContent(messages.generate.grok.langAutomatic);
    await user.click(trigger);

    const options = await screen.findAllByRole('option');
    expect(options).toHaveLength(GROK_LANGUAGES.length);
    expect(options.slice(0, 3).map((option) => option.textContent)).toEqual([
      messages.generate.grok.langAutomatic,
      messages.generate.grok.langEnglish,
      messages.generate.grok.langArabicEgypt,
    ]);

    await user.click(
      screen.getByRole('option', {
        name: messages.generate.grok.langPortugueseBrazil,
      }),
    );
    expect(onChange).toHaveBeenCalledWith('pt-BR');
  });
});
