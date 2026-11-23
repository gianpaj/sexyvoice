// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
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

it('submits only the new turn after hydrating a long thread', async () => {
  const history = Array.from({ length: 100 }, (_, index) => ({
    id: `message-${index}`,
    role: index % 2 ? 'assistant' : 'user',
    parts: [{ type: 'text', content: `Saved turn ${index}` }],
  }));
  const fetchHistory = vi.fn((_: string, init?: RequestInit) =>
    Promise.resolve(
      init?.method === 'POST'
        ? new Response(null, { status: 503 })
        : Response.json({
            messages: history,
            activeRun: null,
            callActive: false,
          }),
    ),
  );
  vi.stubGlobal('fetch', fetchHistory);

  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <VoiceSpikeChat
        draft="The new turn"
        error={null}
        onDraft={vi.fn()}
        onRefresh={vi.fn()}
        onRememberThread={vi.fn()}
        onStartCall={vi.fn()}
        threadId="b3bfc7ad-36f9-4b70-8e64-3baca9968620"
      />
    </NextIntlClientProvider>,
  );

  expect(await screen.findByText('Saved turn 0')).toBeVisible();
  expect(screen.getByText('Saved turn 99')).toBeVisible();
  const send = screen.getByRole('button', { name: 'Send' });
  expect(send).toBeEnabled();
  fireEvent.click(send);
  await waitFor(() => expect(fetchHistory).toHaveBeenCalledTimes(2));
  const post = fetchHistory.mock.calls.find(
    ([, init]) => init?.method === 'POST',
  );
  expect(JSON.parse(String(post?.[1]?.body)).messages).toMatchObject([
    { role: 'user', content: 'The new turn' },
  ]);
});
