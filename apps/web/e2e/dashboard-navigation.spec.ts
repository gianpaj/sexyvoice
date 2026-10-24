import { expect, test } from './fixtures';
import { waitForHydration } from './wait-for-hydration';

/**
 * Dashboard Navigation E2E Tests
 *
 * Sidebar links prefetch each page's `loading.tsx` skeleton, so a click
 * switches pages before the server finishes rendering the destination.
 * Run against a production build: Next.js only prefetches links there.
 */

const historyPath = '/en/dashboard/history';
const isHistoryRequest = (url: URL) => url.pathname === historyPath;

test.describe('Dashboard Navigation - Authenticated User', () => {
  test('sidebar History link shows the prefetched skeleton before the page renders', async ({
    page,
  }) => {
    await page.goto('/en/dashboard/generate');
    await waitForHydration(page, `a[href="${historyPath}"]`);
    // Viewport prefetching of the sidebar links settles before the click.
    await page.waitForLoadState('networkidle');

    // Hold every later request for the destination so the click can only
    // show what the prefetch already delivered.
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(isHistoryRequest, async (route) => {
      await held;
      await route.continue();
    });

    await page.getByRole('link', { exact: true, name: 'History' }).click();

    const skeleton = page.getByTestId('dashboard-page-skeleton');
    await expect(page).toHaveURL(historyPath, { timeout: 2000 });
    await expect(skeleton).toBeVisible({ timeout: 2000 });

    release();

    await expect(
      page.getByRole('heading', { level: 2, name: 'History' }),
    ).toBeVisible();
    await expect(skeleton).toHaveCount(0);
  });
});
