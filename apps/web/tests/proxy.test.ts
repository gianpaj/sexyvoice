import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { describe, expect, it, vi } from 'vitest';

import { config } from '@/proxy';

vi.mock('next-intl/middleware', () => ({
  default: () => () => undefined,
}));

vi.mock('@/lib/supabase/middleware', () => ({
  updateSession: vi.fn(),
}));

describe('proxy matcher', () => {
  const dashboardUrl = 'https://sexyvoice.ai/en/dashboard/generate';

  it('skips Server Action requests', () => {
    expect(
      unstable_doesMiddlewareMatch({
        config,
        headers: { 'next-action': 'action-id' },
        url: dashboardUrl,
      }),
    ).toBe(false);
  });

  it('still matches normal dashboard navigation', () => {
    expect(
      unstable_doesMiddlewareMatch({
        config,
        url: dashboardUrl,
      }),
    ).toBe(true);
  });
});
