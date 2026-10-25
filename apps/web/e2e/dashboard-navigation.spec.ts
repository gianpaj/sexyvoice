import { expect, test } from './fixtures';
import { waitForHydration } from './wait-for-hydration';

/**
 * Dashboard Navigation E2E Tests
 *
 * Dashboard pages render in a few hundred milliseconds, so they have no
 * route-level skeleton. Until the next page commits, the clicked sidebar link
 * shows a pending spinner on desktop, and a top bar shows on phones, where the
 * sidebar drawer closes on click.
 * Run against a production build: Next.js only prefetches links there.
 */

const historyPath = '/en/dashboard/history';

test.describe('Dashboard Navigation - Authenticated User', () => {
  test.skip(
    !process.env.CI,
    'Locally the webServer runs `next dev`, which does not prefetch links.',
  );

  test('sidebar link shows a pending spinner until the next page renders', async ({
    page,
  }) => {
    await page.goto('/en/dashboard/generate');
    await waitForHydration(page, `a[href="${historyPath}"]`);
    // Viewport prefetching of the sidebar links settles before the click.
    await page.waitForLoadState('networkidle');

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

    const link = page
      .locator('[data-sidebar="sidebar"]')
      .getByRole('link', { exact: true, name: 'History' });
    const spinner = link.getByTestId('sidebar-link-pending');
    await expect(spinner).toHaveCSS('opacity', '0');

    await link.click();
    await expect(spinner).toHaveCSS('opacity', '1');
    await expect(page).toHaveURL('/en/dashboard/generate');

    release();

    await expect(page).toHaveURL(historyPath);
    await expect(
      page.getByRole('heading', { level: 2, name: 'Generation History' }),
    ).toBeVisible();
    await expect(spinner).toHaveCSS('opacity', '0');
  });

  test.describe('on a phone', () => {
    test.use({ viewport: { height: 844, width: 390 } });

    test('sidebar drawer link shows the top pending bar until the next page renders', async ({
      page,
    }) => {
      await page.goto('/en/dashboard/generate');
      const trigger = page.getByRole('button', { name: 'Toggle Sidebar' });
      await waitForHydration(page, '[data-sidebar="trigger"]');
      await page.waitForLoadState('networkidle');

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

      const bar = page.getByTestId('mobile-navigation-pending');
      await expect(bar).toHaveCSS('opacity', '0');

      await trigger.click();
      await page
        .locator('[data-sidebar="sidebar"][data-mobile="true"]')
        .getByRole('link', { exact: true, name: 'History' })
        .click();
      await expect(bar).toHaveCSS('opacity', '1');
      await expect(page).toHaveURL('/en/dashboard/generate');

      release();

      await expect(page).toHaveURL(historyPath);
      await expect(
        page.getByRole('heading', { level: 2, name: 'Generation History' }),
      ).toBeVisible();
      await expect(bar).toHaveCSS('opacity', '0');
    });
  });
});
