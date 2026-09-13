// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { captureException } from '@sentry/nextjs';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import GeneratePage from '@/app/[lang]/(dashboard)/dashboard/generate/page';
import { createClient } from '@/lib/supabase/server';
import messages from '@/messages/en.json';

const refresh = vi.hoisted(() => vi.fn());
vi.mock('@/lib/i18n/navigation', () => ({ useRouter: () => ({ refresh }) }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => key,
}));
vi.mock('@/components/credits-section', () => ({ default: () => null }));
vi.mock('@/lib/supabase/queries', () => ({
  hasUserPaid: vi.fn().mockResolvedValue(false),
}));
vi.mock(
  '@/app/[lang]/(dashboard)/dashboard/generate/generateui.client',
  () => ({
    GenerateUI: ({ hasEnoughCredits }: { hasEnoughCredits: boolean }) => (
      <button disabled={!hasEnoughCredits} type="button">
        Generate
      </button>
    ),
  }),
);

async function renderPage(data: unknown, error: Error | null = null) {
  const query = {
    data: [],
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data, error }),
  };
  vi.mocked(createClient).mockResolvedValue({
    auth: {
      getUser: vi
        .fn()
        .mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
    },
    from: vi.fn().mockReturnValue(query),
  } as unknown as Awaited<ReturnType<typeof createClient>>);
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {await GeneratePage({ params: Promise.resolve({ lang: 'en' }) })}
    </NextIntlClientProvider>,
  );
}

afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

describe('generation credit balance', () => {
  it('keeps generation disabled for a confirmed zero without a lookup error', async () => {
    await renderPage({ amount: 0 });
    expect(screen.getByRole('button', { name: 'Generate' })).toBeDisabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(captureException).not.toHaveBeenCalled();
  });

  it('enables generation when the balance is sufficient', async () => {
    await renderPage({ amount: 10_000 });
    expect(screen.getByRole('button', { name: 'Generate' })).toBeEnabled();
  });

  it.each([
    null,
    {},
    { amount: undefined },
    { amount: null },
    { amount: Number.NaN },
  ])('shows a retryable error for an unavailable balance %j', async (data) => {
    await renderPage(data);
    expect(screen.getByRole('alert')).toHaveTextContent(
      messages.creditsSection.balanceError,
    );
    expect(
      screen.queryByRole('button', { name: 'Generate' }),
    ).not.toBeInTheDocument();
    expect(captureException).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('reports a failed query instead of treating it as zero credits', async () => {
    const error = new Error('Database unavailable');
    await renderPage(null, error);
    expect(screen.getByRole('alert')).toBeVisible();
    expect(captureException).toHaveBeenCalledWith(
      error,
      expect.objectContaining({ user: { id: 'user-1' } }),
    );
  });
});
