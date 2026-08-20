import { beforeEach, describe, expect, it, vi } from 'vitest';

import UpdatePasswordPage from '@/app/[lang]/(auth)/protected/update-password/page';
import { createClient } from '@/lib/supabase/server';

const navigationMocks = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock('next/navigation', () => ({
  redirect: navigationMocks.redirect,
}));

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => vi.fn((key: string) => key)),
}));

vi.mock('@/components/header', () => ({
  Header: vi.fn(() => null),
}));

vi.mock(
  '@/app/[lang]/(auth)/protected/update-password/update-password-form',
  () => ({
    UpdatePasswordForm: vi.fn(() => null),
  }),
);

describe('UpdatePasswordPage auth guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects callers without a Supabase session', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: null,
        }),
      },
    } as never);

    await expect(
      UpdatePasswordPage({
        params: Promise.resolve({ lang: 'en' }),
        searchParams: Promise.resolve({ message: '' }),
      }),
    ).rejects.toThrow('NEXT_REDIRECT:/en');

    expect(navigationMocks.redirect).toHaveBeenCalledWith('/en');
  });
});
