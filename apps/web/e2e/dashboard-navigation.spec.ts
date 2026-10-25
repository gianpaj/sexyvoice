import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';
import { waitForHydration } from './wait-for-hydration';

/**
 * Dashboard Navigation E2E Tests
 *
 * Dashboard pages render in a few hundred milliseconds, so they have no
 * route-level skeleton. A top bar shows after a sidebar click until the next
 * page commits, including on phones, where the sidebar drawer closes on click.
 * Run against a production build: Next.js only prefetches links there.
 */

const historyPath = '/en/dashboard/history';

async function expectPendingBarUntilPageRenders(
  page: Page,
  clickHistoryLink: () => Promise<void>,
) {
  // Hold the navigation request so the pending state lasts.
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    (url) => url.pathname === historyPath,
    async (route) => {
      await held;
      await route.continue();
    },
  );

  const bar = page.getByTestId('navigation-pending');
  await expect(bar).toHaveCSS('opacity', '0');

  await clickHistoryLink();
  await expect(bar).toHaveCSS('opacity', '1');
  await expect(page).toHaveURL('/en/dashboard/generate');

  release();

  await expect(page).toHaveURL(historyPath);
  await expect(
    page.getByRole('heading', { level: 2, name: 'Generation History' }),
  ).toBeVisible();
  await expect(bar).toHaveCSS('opacity', '0');
}

test.describe('Dashboard Navigation - Authenticated User', () => {
  test.skip(
    !process.env.CI,
    'Locally the webServer runs `next dev`, which does not prefetch links.',
  );

  test('sidebar link shows the pending bar until the next page renders', async ({
    page,
  }) => {
    await page.goto('/en/dashboard/generate');
    await waitForHydration(page, `a[href="${historyPath}"]`);
    // Viewport prefetching of the sidebar links settles before the click.
    await page.waitForLoadState('networkidle');

    await expectPendingBarUntilPageRenders(page, () =>
      page
        .locator('[data-sidebar="sidebar"]')
        .getByRole('link', { exact: true, name: 'History' })
        .click(),
    );
  });

  test.describe('on a phone', () => {
    test.use({ viewport: { height: 844, width: 390 } });

    test('sidebar drawer link shows the pending bar until the next page renders', async ({
      page,
    }) => {
      await page.goto('/en/dashboard/generate');
      await waitForHydration(page, '[data-sidebar="trigger"]');
      await page.waitForLoadState('networkidle');

      await expectPendingBarUntilPageRenders(page, async () => {
        await page.getByRole('button', { name: 'Toggle Sidebar' }).click();
        await page
          .locator('[data-sidebar="sidebar"][data-mobile="true"]')
          .getByRole('link', { exact: true, name: 'History' })
          .click();
      });
    });
  });
});
