import type { Page } from '@playwright/test';

import { E2E_CALL_USER_COOKIE } from '@/lib/e2e-mocks-shared';

/** Picks the free or paid fixtures that lib/e2e-call-user.ts serves. */
export async function setE2ECallUser(
  page: Page,
  baseURL: string | undefined,
  user: 'free' | 'paid',
) {
  if (!baseURL) {
    throw new Error('E2E call user cookie requires a Playwright baseURL');
  }
  await page.context().addCookies([
    {
      name: E2E_CALL_USER_COOKIE,
      url: new URL('/', baseURL).href,
      value: user,
    },
  ]);
}
