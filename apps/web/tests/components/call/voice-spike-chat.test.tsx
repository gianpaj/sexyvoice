// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';

import { VoiceSpikeChat } from '@/components/call/voice-spike-chat';
import messages from '@/messages/en.json';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('shows saved chat while a call ends and rehydrates once the lease clears', async () => {
  const saved = {
    id: 'chat-user:example',
    role: 'user',
    parts: [{ type: 'text', content: 'Saved test message' }],
  };
  const getHistory = (callActive: boolean) =>
    Response.json({ messages: [saved], activeRun: null, callActive });
  const fetchHistory = vi
    .fn()
    .mockResolvedValueOnce(getHistory(true))
    .mockResolvedValueOnce(getHistory(false));
  vi.stubGlobal('fetch', fetchHistory);
  const onRefresh = vi.fn();

  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <VoiceSpikeChat
        draft="A second message"
        error={null}
        onDraft={vi.fn()}
        onRefresh={onRefresh}
        onRememberThread={vi.fn()}
        onStartCall={vi.fn()}
        threadId="b3bfc7ad-36f9-4b70-8e64-3baca9968620"
      />
    </NextIntlClientProvider>,
  );

  expect(await screen.findByText('Saved test message')).toBeVisible();
  expect(screen.getByRole('status')).toHaveTextContent(
    'Waiting for the call to end…',
  );
  expect(screen.getByRole('button', { name: 'Start call' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(fetchHistory).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(onRefresh).toHaveBeenCalledOnce(), {
    timeout: 2500,
  });
  expect(fetchHistory).toHaveBeenCalledTimes(2);
});
