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

import { AudioFeedback } from '@/components/audio-feedback';
import messages from '@/messages/en.json';

const read = vi.hoisted(() => ({
  eq: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({
    from: () => ({
      select: () => ({
        eq: read.eq.mockReturnValue({
          abortSignal: () => ({ maybeSingle: read.maybeSingle }),
        }),
      }),
    }),
  }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('restores the saved audio rating and shows an updated selection', async () => {
  const audioFileId = 'f49aabb3-d5fb-4dc9-8c9d-49d263e400cc';
  read.maybeSingle.mockResolvedValue({ data: { rating: 'up' } });
  const fetch = vi.fn().mockResolvedValue(Response.json({ rating: 'down' }));
  vi.stubGlobal('fetch', fetch);
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <AudioFeedback audioFileId={audioFileId} />
    </NextIntlClientProvider>,
  );

  const good = screen.getByRole('button', { name: 'Good audio' });
  const bad = screen.getByRole('button', { name: 'Bad audio' });
  await waitFor(() => expect(good).toHaveAttribute('aria-pressed', 'true'));
  expect(read.eq).toHaveBeenCalledWith('audio_file_id', audioFileId);
  fireEvent.click(bad);
  await waitFor(() => expect(bad).toHaveAttribute('aria-pressed', 'true'));
  expect(good).toHaveAttribute('aria-pressed', 'false');
});
