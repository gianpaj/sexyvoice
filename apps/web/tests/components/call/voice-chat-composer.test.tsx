// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';

import { VoiceChatComposer } from '@/components/call/voice-chat-composer';
import messages from '@/messages/en.json';

afterEach(cleanup);

it('sends on Enter and preserves Shift+Enter and IME composition', () => {
  const onSend = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <VoiceChatComposer
        draft="A reply"
        onDraft={vi.fn()}
        onSend={onSend}
        placeholder="Write a message"
        sendDisabled={false}
      />
    </NextIntlClientProvider>,
  );

  const input = screen.getByRole('textbox', { name: 'Message' });
  expect(fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })).toBe(true);
  expect(fireEvent.keyDown(input, { key: 'Enter', isComposing: true })).toBe(
    true,
  );
  expect(onSend).not.toHaveBeenCalled();

  fireEvent.keyDown(input, { key: 'Enter' });
  expect(onSend).toHaveBeenCalledOnce();
});
