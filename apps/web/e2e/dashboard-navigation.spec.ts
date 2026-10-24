import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';
import { waitForHydration } from './wait-for-hydration';

/**
 * Dashboard Navigation E2E Tests
 *
 * Sidebar links prefetch each page's `loading.tsx` skeleton, so a click
 * switches pages before the server finishes rendering the destination.
 * Run against a production build: Next.js only prefetches links there.
 */

async function expectPrefetchedSkeleton(
  page: Page,
  { heading, link, path }: { heading: string; link: string; path: string },
) {
  await page.goto('/en/dashboard/generate');
  await waitForHydration(page, `a[href="${path}"]`);
  // Viewport prefetching of the sidebar links settles before the click.
  await page.waitForLoadState('networkidle');

  // Hold every later request for the destination so the click can only
  // show what the prefetch already delivered.
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    (url) => url.pathname === path,
    async (route) => {
      await held;
      await route.continue();
    },
  );

  await page.getByRole('link', { exact: true, name: link }).click();

  const skeleton = page.getByTestId('dashboard-page-skeleton');
  await expect(page).toHaveURL(path, { timeout: 2000 });
  await expect(skeleton).toBeVisible({ timeout: 2000 });

  release();

  await expect(
    page.getByRole('heading', { level: 2, name: heading }),
  ).toBeVisible();
  await expect(skeleton).toHaveCount(0);
}

test.describe('Dashboard Navigation - Authenticated User', () => {
  test.skip(
    !process.env.CI,
    'Locally the webServer runs `next dev`, which does not prefetch links.',
  );

  test('sidebar History link shows the prefetched skeleton before the page renders', async ({
    page,
  }) => {
    await expectPrefetchedSkeleton(page, {
      heading: 'History',
      link: 'History',
      path: '/en/dashboard/history',
    });
  });

  test('sidebar Call link shows the prefetched skeleton before the page renders', async ({
    page,
  }) => {
    await expectPrefetchedSkeleton(page, {
      heading: 'Voice calls',
      link: 'Call',
      path: '/en/dashboard/call',
    });
  });
});
